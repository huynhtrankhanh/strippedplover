#!/usr/bin/env python3
# Copyright (c) 2010 Joshua Harlan Lifton.
# See LICENSE.txt for details.

"""Stripped Plover - Minimal setup.py"""

import os

from setuptools import setup

__software_name__ = "plover"

with open(os.path.join(__software_name__, "__init__.py")) as fp:
    exec(fp.read())


def reqs(name):
    with open(os.path.join("reqs", name + ".txt")) as fp:
        return fp.read()


setup(
    name=__software_name__,
    version=__version__,
    description=__description__,
    url=__url__,
    download_url=__download_url__,
    license=__license__,
    install_requires=reqs("dist"),
)
