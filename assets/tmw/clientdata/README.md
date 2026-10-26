# Client Data for TMW2
[![pipeline status](https://git.themanaworld.org/ml/clientdata/badges/master/pipeline.svg)](https://git.themanaworld.org/ml/clientdata/commits/master)

Remember to link music repo music folder here.
Example command:

```sh
ln -s music/music client-data/
```

Useful commands:

```sh
make contrib
```

Make contributors list, both for wiki and client-data.
You'll later have to git add and git pull the wiki repository (wiki/ folder)

```sh
make pipeline
```

Runs an even shorter testxml, and then does an ICC check. Fix all errors and warnings
before pushing any work or your changes **may be reverted**.

----
## Licenses

Official Server License is GPL v3. Most data here is on compatibility, original
license as CC BY-SA, and therefore, requires special care before re-using.

You can find attribution and data on `LICENSE` file; Some licenses verbatim copies
can be found by their name as well, like `GPL` and `MIT`.

If something is not listed there, assume GPL v2+. (No attribution but Copyrights
fields required). If it is listed, but it's not filled, it means author is unknown
at the moment, but it can be used as GPL v2+.

----
## Requeriments

We aim to be compatible with ManaPlus and TMW clients, as well as with end-user
hardware specs, be it low (like a Raspberry Pi user) or high (like a user with a
4K monitor and whatever hardware required to run it).

However, we are pixelart. Here are some current specs:

* 32x32 for most art assets, except:
* 32x64 for player sprite
* 16x16 for badges
* Other sizes for oversized/undersized elements like Pious and Yetis
* Minimum six layers in this order:
  - Ground, Fringe, Over, Collision, Heights, Objects

We have other requirements like minimum Tiled version and map width, as well as
maximum number of tilesets/layers/etc; These are more volatile and will not be
included on the project's README. Please refer to the
[wiki](https://wiki.moubootaurlegends.org) instead.
