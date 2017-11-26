# Sony Bravia TVs

This module finds and makes Sony Bravia TVs controllable as a device in the
Tinkerhub network.

## Installation and setup

When running [tinkerhubd](https://github.com/tinkerhub/tinkerhub-daemon) install via:

`tinkerhubd install device-bravia-tv`

All TVs found will be exposed as devices of type `bravia-tv` (and `tv` as a
secondary type). You will need to authenticate with your TV, you can do this
easily via the CLI:

```
$ tinkerhub
> type:bravia-tv authenticate
 SUCCESS  TV (uuid-of-device)
  Call authenticate with code displayed on TV
> type:bravia-tv authenticate 0000
 SUCCESS  TV (uuid-of-device)
   Authenticated with TV
```

