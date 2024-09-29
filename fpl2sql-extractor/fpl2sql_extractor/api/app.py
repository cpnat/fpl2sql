import asyncio
import logging
import os
import time

from fpl2sql_extractor.consts import MAX_CONCURRENT_REQUESTS
from fpl2sql_extractor.main import FPLDataProcessor
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse


log_level = "INFO"
logger = logging.getLogger()
logger.setLevel(log_level)

console_handler = logging.StreamHandler()
console_handler.setLevel(log_level)
logger.addHandler(console_handler)

app = Starlette()


@app.route("/")
async def handle_request(request):
    auth_header = request.headers.get("Authorization")
    if auth_header != f"Bearer {os.environ.get('CRON_SECRET')}":
        logger.warning("Unauthorized access attempt detected.")
        return PlainTextResponse("Unauthorized", status_code=401)

    try:
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        start_time = time.time()

        logger.info("Extracting and uploading data")
        processor = FPLDataProcessor(semaphore=semaphore)

        await processor.process()

        logger.info(f"Data processing took {time.time() - start_time:.2f} seconds")

        return PlainTextResponse("Data extraction and upload completed successfully.", status_code=200)

    except Exception as e:
        logger.error(f"Error occurred: {e}")
        return PlainTextResponse("An error occurred while processing the request.", status_code=500)
