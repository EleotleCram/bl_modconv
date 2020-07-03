#!/usr/bin/env node

const die = (message) => {
	console.error(message.replace(/[\n\s]+/g, " "));
	process.exit(-1);
};

const fs = require("fs");
const pjson = require("./package.json");
const ArgumentParser = require("argparse").ArgumentParser;

const Blend = require("./BlenderBlend");
const KaitaiStream = require("kaitai-struct/KaitaiStream");

const parser = new ArgumentParser({
	version: pjson.version,
	addHelp: true,
	description: pjson.description,
});
parser.addArgument(["BLEND_FILE"], {
	help: "Blender file to patch",
});
parser.addArgument(["-m", "--modifier"], {
	help: "modifier name (e.g. BevelModifier)",
	required: true,
});
parser.addArgument(["-d", "--modifier-data"], {
	help: "modifier data name (e.g. BevelModifierData)",
	required: true,
});
parser.addArgument(["--old-enum-type"], {
	help: "old modifier enum type",
	type: "int",
	required: true,
});
parser.addArgument(["--new-enum-type"], {
	help: "new modifier enum type",
	type: "int",
	required: true,
});

const args = parser.parseArgs();

const modifierName = args.modifier;
const modifierDataTypeName = args.modifier_data;
const oldEnumType = args.old_enum_type;
const newEnumType = args.new_enum_type;
const fileName = args.BLEND_FILE;
const fileContent = fs.readFileSync(fileName);

////////////////////////////////////////////////////////////////////////////////

// Kaitai Struct code (only supports readonly)

const lookupSdnaIndexForModifierDataStruct = (fileContent, modifierDataTypeName) => {
	const parsedBlend = new Blend(new KaitaiStream(fileContent));
	const dna1 = parsedBlend.blocks.find((block) => block.code === "DNA1");

	console.log(`Finding idxType for ${modifierDataTypeName}...`);
	const idxType = dna1.body.types.findIndex((n) => n === modifierDataTypeName);
	console.log(`	\`-> ${idxType}`);
	console.log(`Finding sdnaIndex for idxType===${idxType}...`);
	const sdnaIndex = dna1.body.structs.findIndex((s) => s.idxType === idxType);
	console.log(`	\`-> ${sdnaIndex}`);

	return sdnaIndex;
};

////////////////////////////////////////////////////////////////////////////////

//	Too bad Kaitai Struct cannot write binary formats yet :(

const PTR_SIZE_32 = 0x5f;
const PTR_SIZE_64 = 0x2d;
const PTR_SIZE_BYTE_LEN = {
	[PTR_SIZE_32]: 4,
	[PTR_SIZE_64]: 8,
};
const BE = 0x56;
const LE = 0x76;

const fileConfig = {
	endian: LE,
	ptrSize: PTR_SIZE_BYTE_LEN[PTR_SIZE_64],
};

const readUint32 = (buffer, offset) => {
	let uint32 = -1;
	const { endian } = fileConfig;
	if (endian === LE) {
		uint32 =
			buffer[offset + 0] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
	} else if (endian === BE) {
		uint32 =
			buffer[offset + 3] | (buffer[offset + 2] << 8) | (buffer[offset + 1] << 16) | (buffer[offset + 0] << 24);
	} else {
		die(`Unsupported endianness: ${endian}`);
	}

	return uint32;
};

const writeUint32 = (buffer, offset, uint32) => {
	const { endian } = fileConfig;
	if (endian === LE) {
		buffer[offset + 0] = uint32 & 0xff;
		buffer[offset + 1] = (uint32 & 0xff00) >> 8;
		buffer[offset + 2] = (uint32 & 0xff0000) >> 16;
		buffer[offset + 3] = (uint32 & 0xff000000) >> 24;
	} else if (endian === BE) {
		buffer[offset + 3] = uint32 & 0xff;
		buffer[offset + 2] = (uint32 & 0xff00) >> 8;
		buffer[offset + 1] = (uint32 & 0xff0000) >> 16;
		buffer[offset + 0] = (uint32 & 0xff000000) >> 24;
	} else {
		die(`Unsupported endianness: ${endian}`);
	}
};

const readString = (buffer, offset, len) =>
	buffer
		.slice(offset, offset + len)
		.toString("utf-8")
		.trim()
		.replace(/\0/g, ""); // Note: trim() does not remove ASCII NUL chars.

const patchFileBlock = ({ fileBlock, fileBlockHeader, modifierName, oldEnumType, newEnumType }) => {
	const { ptrSize } = fileConfig;
	const modifierTypeDnaFieldOffset = 2 * ptrSize; // i.e. ModifierData *next, *prev
	const modifierNameDnaFieldOffset = 32;
	const fileBlockBody = fileBlock.slice(fileBlockHeader.length);
	const actualModifierName = readString(fileBlockBody, modifierNameDnaFieldOffset, 64);
	const actualOldEnumType = readUint32(fileBlockBody, modifierTypeDnaFieldOffset);

	// Now for some file operation consistency checks...

	if (modifierName !== actualModifierName) {
		die(
			`Unexpected modifier name while patching data block with sdnaIndex=${fileBlockHeader.sdnaIndex}. 
			Expected existing modifier name to be \`${modifierName}', but was \`${actualModifierName}'. Bailing out...`
		);
	}

	if (oldEnumType !== actualOldEnumType) {
		die(
			`Unexpected modifier enum type while patching data block with sdnaIndex=${fileBlockHeader.sdnaIndex}. 
			Expected existing modifier enum type to be ${oldEnumType}, but was ${actualOldEnumType}. Bailing out...`
		);
	}

	writeUint32(fileBlockBody, modifierTypeDnaFieldOffset, newEnumType);
};

const readFileBlockHeader = (buffer, offset) => {
	const _ = (x) => x + offset;
	const FILEBLOCK_CODE_OFFSET = _(0);
	const FILEBLOCK_BODY_LEN_OFFSET = _(4);
	const FILEBLOCK_SDNA_INDEX_OFFSET = _(16);
	const FILEBLOCK_COUNT_OFFSET = _(20);
	const FILEBLOCK_BODY_OFFSET = _(24);

	return {
		code: readString(buffer, FILEBLOCK_CODE_OFFSET, 4),
		bodyLength: readUint32(buffer, FILEBLOCK_BODY_LEN_OFFSET),
		sdnaIndex: readUint32(buffer, FILEBLOCK_SDNA_INDEX_OFFSET),
		count: readUint32(buffer, FILEBLOCK_COUNT_OFFSET),
		length: 24,
		absoluteBodyOffset: FILEBLOCK_BODY_OFFSET,
	};
};

const readHeader = (buffer, offset) => {
	const _ = (x) => x + offset;
	const MAGIC = "BLENDER";
	const MAGIC_OFFSET = _(0);
	const PTR_SIZE_OFFSET = _(7);
	const ENDIAN_OFFSET = _(8);

	const magic = readString(buffer, MAGIC_OFFSET, MAGIC.length);

	if (MAGIC !== magic) {
		die(`Not a blender file format: ${fileName}`);
	}

	fileConfig.ptrSize = PTR_SIZE_BYTE_LEN[fileContent[PTR_SIZE_OFFSET]];
	fileConfig.endian = fileContent[ENDIAN_OFFSET];
};

const HEADER_OFFSET = 0;
const FILEBLOCKS_OFFSET = 12;

let offset = HEADER_OFFSET;

readHeader(fileContent, offset);

offset = FILEBLOCKS_OFFSET;

const sdnaIndex = lookupSdnaIndexForModifierDataStruct(fileContent, modifierDataTypeName);

console.log("Iterating blend file blocks...");
let numBlocksPatched = 0;
while (true) {
	let header = readFileBlockHeader(fileContent, offset);

	if (header.code === "DATA" && header.sdnaIndex === sdnaIndex) {
		// console.log("Header: ", header);
		console.log(`Found DATA block with sdnaIndex=${sdnaIndex} at offset ${offset}`);
		const fileBlock = fileContent.slice(offset, offset + header.length + header.bodyLength);
		console.log("	`-> Patching...");
		patchFileBlock({
			fileBlock,
			fileBlockHeader: header,
			modifierName,
			oldEnumType,
			newEnumType,
		});

		numBlocksPatched++;
	}

	if (header.code === "ENDB") {
		break;
	}

	offset = header.absoluteBodyOffset + header.bodyLength;
}

if (numBlocksPatched > 0) {
	console.log(`Done patching file. ${numBlocksPatched} block${numBlocksPatched > 1 ? "s were" : " was"} patched`);

	const targetFileName = fileName.replace(/\.blend/, "_converted.blend");
	console.log(`Writing result to file: \`${targetFileName}'...`);
	fs.writeFileSync(targetFileName, fileContent);
	console.log("Done.\n\nHave a nice day!");
} else {
	console.log("No blocks found that needed to be patched.");
	console.log("Nothing to do.");
}
