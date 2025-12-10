# Copyright (c) 2013 Hesky Fisher
# See LICENSE.txt for details.

"""A simplified logging module for Stripped Plover."""

import sys
import logging

from logging import DEBUG, INFO, WARNING, ERROR


LOG_FORMAT = "%(asctime)s [%(threadName)s] %(levelname)s: %(message)s"


class PrintHandler(logging.StreamHandler):
    """Handler that outputs messages to stderr."""

    def __init__(self, format=LOG_FORMAT):
        super().__init__(sys.stderr)
        self.setFormatter(logging.Formatter(format))


class Logger:
    def __init__(self):
        self._print_handler = PrintHandler()
        self._print_handler.setLevel(WARNING)
        self._logger = logging.getLogger("plover")
        self._logger.addHandler(self._print_handler)
        self._logger.setLevel(INFO)

    def set_level(self, level):
        self._print_handler.setLevel(level)
        self.setLevel(level)

    # Delegate calls to _logger.
    def __getattr__(self, name):
        return getattr(self._logger, name)


# Set up default logger.
__logger = Logger()

# The following functions direct all input to __logger.
debug = __logger.debug
info = __logger.info
warning = __logger.warning
error = __logger.error
set_level = __logger.set_level
add_handler = __logger.addHandler
remove_handler = __logger.removeHandler

# No-op functions for compatibility
def has_platform_handler():
    return False

def setup_platform_handler():
    pass

def set_stroke_filename(filename=None):
    pass

def stroke(s):
    pass

def translation(undo, do, prev):
    pass

def enable_stroke_logging(enable):
    pass

def enable_translation_logging(enable):
    pass

def setup_logfile():
    pass
