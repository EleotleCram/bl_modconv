# Project Title

Blender file modifier type patching utility

## Introduction

When following [the instructions on how to add a custom modifier to Blender](https://blog.exppad.com/article/writing-blender-modifier), it becomes clear that adding you own modifier to [Blender](https://www.blender.org/) requires patching of a ton of core Blender files. This essentially results in forking the Blender file format specifically for your modifier (until you get your modifier code in the main Blender trunk).

When you use your own modifier in `.blend` files for production, you run the risk that future versions of Blender may use the same enum for your modifier type and this will break your `.blend` files and your custom modifier.

This project contains a commandline tool, `bl_modconv` that can be used to patch a `.blend` file, such that you can select a new _onoccupied_ enum type for your custom modifier.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine.

### Prerequisites

To run this tool you'll need a recent version of [NodeJS](https://nodejs.org/en/). You are suggested to use [NVM](https://github.com/nvm-sh/nvm) to manage your installed versions of NodeJS.

### Setting up bl_modconv

Clone the repository.

```
$ git clone https://github.com/EleotleCram/bl_modconv
```

Change directory and run npm install:

```
$ cd bl_modconv
$ npm install
```

### Running bl_modconv

Once `bl_modconv` has been set up, you can run it as follows:

```
$ ./bl_modconv.js -m MyCustomModifier -d MyCustomModifierData --old-enum-type 57 --new-enum-type 58 my-blendfile-with-my-custom-modifier-as-enum-type-57.blend
```

This will result in a new file, ` my-blendfile-with-my-custom-modifier-as-enum-type-57_converted.blend`, written to disk.  After compiling a new version of Blender with your custom modifier now being registered as enum `58`, you can use the newly built Blender to open the converted `.blend` file and any objects using your custom modifier will be correctly linked to it.

## Built With

* [Kaitai Struct](http://kaitai.io/) - A new way to develop parsers for binary structures.
* [NodeJS](https://nodejs.org/en/) - Node.js® is a JavaScript runtime built on Chrome's V8 JavaScript engine.
* [npmjs](https://www.npmjs.com/) - Build amazing things

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/EleotleCram/bl_modconv/tags).

## Authors

* **Marcel Toele** - *Initial work* - [bl_modconv](https://github.com/EleotleCram/bl_modconv)

See also the list of [contributors](https://github.com/EleotleCram/bl_modconv/contributors) who participated in this project.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* Kaitai Struct and their [.blend file format description](https://formats.kaitai.io/blender_blend/index.html)

