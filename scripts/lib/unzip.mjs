import { inflateRawSync } from 'node:zlib'

/**
 * Reads the entries of a ZIP archive.
 *
 * Hand-rolled against the format rather than pulling in a dependency: it is a
 * central directory and some deflate streams, and this keeps the fetch scripts
 * runnable anywhere Node runs — including a CI image with no shell tools.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50

export function readZipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer)
  if (endOffset === -1) throw new Error('Not a ZIP archive: no end-of-central-directory record')

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let cursor = buffer.readUInt32LE(endOffset + 16)

  const entries = []
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) break

    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)

    entries.push({
      name,
      read: () => readEntry(buffer, localHeaderOffset, compressionMethod, compressedSize),
    })

    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readEntry(buffer, localHeaderOffset, compressionMethod, compressedSize) {
  // The local header repeats the name and extra-field lengths, and they can
  // differ from the central directory's, so they must be read again here.
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28)
  const start = localHeaderOffset + 30 + nameLength + extraLength
  const data = buffer.subarray(start, start + compressedSize)

  if (compressionMethod === 0) return data
  if (compressionMethod === 8) return inflateRawSync(data)
  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`)
}

function findEndOfCentralDirectory(buffer) {
  // The record is at the end, after a comment of up to 64 KB.
  const earliest = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  return -1
}
