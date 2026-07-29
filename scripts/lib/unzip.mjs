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

/**
 * Ceiling on what one entry may inflate to.
 *
 * These archives come off the public internet, and a deflate stream can expand
 * by a thousand to one: a few megabytes of hostile or simply corrupt input
 * exhausts the machine's memory before anything notices. The largest legitimate
 * entry here is FIDE's rating list, a few hundred megabytes of fixed-width text,
 * so 512 MB clears the real case with room to spare.
 */
const MAX_INFLATED_BYTES = 512 * 1024 * 1024

/** Offsets come out of the file itself, so every read has to be in range. */
function requireRange(buffer, offset, length, what) {
  if (offset < 0 || offset + length > buffer.length) {
    throw new Error(`Malformed ZIP: ${what} at ${offset} runs past the end of the archive`)
  }
}

export function readZipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer)
  if (endOffset === -1) throw new Error('Not a ZIP archive: no end-of-central-directory record')

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let cursor = buffer.readUInt32LE(endOffset + 16)

  const entries = []
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, cursor, 46, 'central directory entry')
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) break

    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    requireRange(buffer, cursor + 46, nameLength, 'entry name')
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
  requireRange(buffer, localHeaderOffset, 30, 'local file header')

  // The local header repeats the name and extra-field lengths, and they can
  // differ from the central directory's, so they must be read again here.
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26)
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28)
  const start = localHeaderOffset + 30 + nameLength + extraLength
  requireRange(buffer, start, compressedSize, 'entry data')
  const data = buffer.subarray(start, start + compressedSize)

  if (compressionMethod === 0) return data
  if (compressionMethod === 8) {
    // maxOutputLength makes zlib stop and throw at the ceiling rather than
    // inflating until the process dies.
    return inflateRawSync(data, { maxOutputLength: MAX_INFLATED_BYTES })
  }
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
