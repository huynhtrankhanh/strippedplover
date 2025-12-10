"""Command meta for Stripped Plover.

This handles {PLOVER:command} syntax in translations.
Commands are ignored in stripped plover since there's no engine to command.
"""


def meta_command(ctx, command):
    # In stripped plover, engine commands are no-ops
    action = ctx.copy_last_action()
    action.command = command
    return action
