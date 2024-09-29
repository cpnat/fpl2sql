import asyncio
import logging
import os
import tempfile

from asyncio import Semaphore
from datetime import datetime, timezone

import aioboto3  # type: ignore
import duckdb

from fpl2sql_extractor.consts import MAX_CONCURRENT_REQUESTS
from fpl2sql_extractor.extractors.bootstrap_extractor import get_bootstrap_tables
from fpl2sql_extractor.extractors.element_summary_extractor import get_element_summary_table
from fpl2sql_extractor.extractors.fixtures_extractor import get_fixtures_table
from fpl2sql_extractor.extractors.utils import pydantic_records_to_df
from fpl2sql_extractor.models.last_updated import LastUpdated


logger = logging.getLogger(__name__)


class FPLDataProcessor:
    def __init__(self, semaphore: Semaphore):
        """
        Initializes the FPLDataProcessor class by creating a temporary directory for data processing,
        setting up environment variables, and configuring paths for the database and export files.
        """
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_name = "fpl2duck.db"
        self.export_dir = "db_export"
        self.client_secret = os.getenv("CLIENT_SECRET")
        self.client_id = os.getenv("CLIENT_ID")
        self.endpoint_url = os.getenv("ENDPOINT_URL")
        self.bucket_name = os.getenv("BUCKET_NAME")
        # To ensure the semaphore is on the same event loop in Vercel, it must be created on the main event loop.
        # This is why we pass it into the constructor.
        self.semaphore = semaphore

    async def extract_data(self) -> None:
        """
        Extracts data from the bootstrap, fixtures, and element summary tables, stores them in a DuckDB database,
        and exports the data to Parquet format inside the temporary directory.
        """
        bootstrap_tables_dict = await get_bootstrap_tables()
        fixtures_table_dict = await get_fixtures_table()
        element_summary_dict = await get_element_summary_table(semaphore=self.semaphore)
        last_updated = LastUpdated(last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

        tables = {
            **bootstrap_tables_dict,
            **fixtures_table_dict,
            **element_summary_dict,
            "last_updated": [last_updated],
        }

        logger.info("Creating a database connection")

        os.chdir(self.temp_dir.name)
        conn = duckdb.connect(database=self.db_name, read_only=False)

        for table_name, records in tables.items():
            logger.info(f"Creating table: {table_name}")
            df = pydantic_records_to_df(records)
            table_rows, table_columns = df.shape
            logger.info(f"Table size: {table_rows} rows, {table_columns} columns")

            if table_rows > 0:
                conn.register(table_name, df)
                conn.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM {table_name}")

        conn.close()  # We need to close the connection to purge the temp tables associated with the Dataframes
        conn = duckdb.connect(database=self.db_name, read_only=True)
        conn.execute(f"EXPORT DATABASE '{self.export_dir}' (FORMAT PARQUET);")

        logger.info("Closing the connection")
        conn.close()

    async def delete_files_in_bucket(self, s3_client):
        """
        Deletes all files in the specified S3-compatible bucket.

        Args:
            s3_client: The aioboto3 S3 client object.
        """
        response = await s3_client.list_objects_v2(Bucket=self.bucket_name)
        if "Contents" in response:
            delete_tasks = []
            for file in response["Contents"]:
                logger.info(f"Deleting file: {file['Key']}")
                delete_tasks.append(s3_client.delete_object(Bucket=self.bucket_name, Key=file["Key"]))
            await asyncio.gather(*delete_tasks)
        else:
            logger.info(f"No files found in bucket {self.bucket_name}.")

    async def upload_files_to_bucket(self, s3_client):
        """
        Uploads the exported Parquet files from the temporary directory to the S3-compatible bucket.

        Args:
            s3_client: The aioboto3 S3 client object.
        """
        upload_tasks = []
        files_path = os.path.join(self.temp_dir.name, self.export_dir)
        for file in os.listdir(files_path):
            file_path = os.path.join(files_path, file)
            logger.info(f"Uploading file: {file}")
            upload_tasks.append(s3_client.upload_file(file_path, self.bucket_name, f"{self.export_dir}/{file}"))
        await asyncio.gather(*upload_tasks)

    async def upload_data(self) -> None:
        """
        Uploads the exported data to an S3-compatible cloud storage service from the temporary directory.
        It first deletes existing files in the bucket and then uploads the new files.
        """
        session = aioboto3.Session()

        async with session.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.client_id,
            aws_secret_access_key=self.client_secret,
        ) as s3_client:
            await self.delete_files_in_bucket(s3_client)
            await self.upload_files_to_bucket(s3_client)

        logger.info("Data uploaded to the cloud storage")

    async def process(self):
        """
        Orchestrates the entire process of data extraction and upload.
        It first extracts the data from various sources, stores it in DuckDB, and then exports and uploads the
        data to cloud storage.
        """
        logger.info("Processing data")
        await self.extract_data()
        await self.upload_data()

    def __del__(self):
        self.temp_dir.cleanup()


async def main():
    semaphore = Semaphore(MAX_CONCURRENT_REQUESTS)

    processor = FPLDataProcessor(semaphore=semaphore)

    async with semaphore:
        await processor.process()


if __name__ == "__main__":
    asyncio.run(main())
