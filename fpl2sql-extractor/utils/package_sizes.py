import os

import pkg_resources


def get_package_size(package_location: str):
    """
    Get the size of packages in a directory in bytes. As we are deploying to Vercel, we need to keep the size of the
    deployment package as small as possible.
    """
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(package_location):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.isfile(fp):  # Only add size if it's a file
                total_size += os.path.getsize(fp)
    return total_size


def main():
    packages = pkg_resources.working_set
    package_sizes = []

    for dist in packages:
        package_name = dist.project_name
        package_location = dist.location
        package_size = get_package_size(os.path.join(package_location, dist.key))
        package_sizes.append((package_name, package_size))

    package_sizes.sort(key=lambda x: x[1], reverse=True)

    for pkg, size in package_sizes:
        print(f"{pkg}: {size / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    main()
