# Copyright (c) 2012 Hesky Fisher
# See LICENSE.txt for details.

"""Platform dependent configuration for Stripped Plover."""

import os
import sys


if sys.platform.startswith("darwin"):
    PLATFORM = "mac"
elif sys.platform.startswith("linux"):
    PLATFORM = "linux"
elif sys.platform.startswith("win"):
    PLATFORM = "win"
elif sys.platform.startswith(("freebsd", "openbsd")):
    PLATFORM = "bsd"
else:
    PLATFORM = None

PROGRAM_DIR = os.getcwd()

# Setup configuration directory - simplified for stripped plover
# Uses current working directory or XDG_CONFIG_HOME/plover
CONFIG_BASENAME = "plover.cfg"
if os.path.isfile(os.path.join(PROGRAM_DIR, CONFIG_BASENAME)):
    CONFIG_DIR = PROGRAM_DIR
else:
    # Try XDG config directory on Linux/BSD, or fall back to home directory
    xdg_config = os.environ.get("XDG_CONFIG_HOME", os.path.expanduser("~/.config"))
    CONFIG_DIR = os.path.join(xdg_config, "plover")

CONFIG_FILE = os.path.join(CONFIG_DIR, CONFIG_BASENAME)

# Setup plugins directory.
PLUGINS_PLATFORM = PLATFORM

ASSETS_DIR = os.path.realpath(os.path.join(__file__, "../../assets"))
