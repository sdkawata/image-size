import pLimit from 'p-limit'
import { DragEvent, useState } from 'react'

const readAllEntries = async (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  let entries: FileSystemEntry[] = []
  const reader = dir.createReader()
  while(true) {
    const newEntries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (newEntries.length === 0) {
      break
    }
    entries = entries.concat(newEntries)
  }
  return entries;
}

const searchFiles = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.isFile) {
    return [await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject)
    })]
  } else if (entry.isDirectory) {
    const entries = await readAllEntries(entry as FileSystemDirectoryEntry)
    return (await Promise.all(entries.map(searchFiles))).flat()
  } else {
    return []
  }
}

const getFiles = async (items: DataTransferItemList): Promise<File[]> => {
  const itemArrays = Array.from(items)
  return (await Promise.all(itemArrays.map(async item => {
    const entry = item.webkitGetAsEntry();
    if (entry === null) {
      return [];
    } else {
      return searchFiles(entry)
    }
  }))).flat()
}

const getImageSize1 = async (files: File[]): Promise<string> => {
  console.log("start")
  let log = "";
  const start = window.performance.now()
  const limit = pLimit(10)
  await Promise.all(
    files.map(file => limit(async () => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise<void>(resolve => {
        img.onload = () => {
          log += `${file.name}: ${img.width}x${img.height}\n`
          resolve()
        }
      })
    }))
  )
  const end = window.performance.now()
  log = `time: ${end - start}ms\n` + log
  console.log("end")
  return log
}

class BufferedReader {
  private blob: Blob
  private chunkSize: number
  private current: number = 0
  private cachePos: number = 0
  private cache: Uint8Array|null = null
  constructor(blob: Blob, chunkSize: number) {
    this.blob = blob
    this.chunkSize = chunkSize
  }
  advance(ptr: number) {
    this.current += ptr
  }
  async slice(start: number, end: number): Promise<Uint8Array> {
    if (start + this.current >= this.cachePos && end + this.current < this.cachePos + this.chunkSize && this.cache !== null) {
      return this.cache.slice(start + this.current - this.cachePos, end + this.current - this.cachePos)
    }
    if (this.chunkSize <= end - start) {
      throw new Error("too large slice")
    }
    this.cachePos = start + this.current
    this.cache = new Uint8Array(await this.blob.slice(this.cachePos, this.cachePos + this.chunkSize).arrayBuffer())
    return this.cache.slice(0, end - start)
  }
}

const getImageSizeFromBlob = async (file: Blob): Promise<{x:number,y:number}|null> => {
  let seenSegment = 0
  const reader = new BufferedReader(file, 65536)
  const header = new Uint8Array(await reader.slice(0, 2));
  if (header[0] !== 0xFF || header[1] !== 0xD8) {
    return null;
  }
  reader.advance(2)
  while(true) {
    const segmentHeader = new Uint8Array(await reader.slice(0, 4));
    console.log(segmentHeader)
    if (segmentHeader[0] !== 0xFF) {
      return null;
    }
    const segmentType = segmentHeader[1];
    const segmentSize = new DataView(segmentHeader.slice(2, 4).buffer).getUint16(0);
    if (segmentType >= 0xC0 && segmentType <= 0xCF) {
      // SOF
      // P: 1byte
      // Y: 2byte
      // X: 2byte
      reader.advance(4);
      const segmentData = new Uint8Array(await reader.slice(0, 5));
      const y = new DataView(segmentData.slice(1, 3).buffer).getUint16(0);
      const x = new DataView(segmentData.slice(3, 5).buffer).getUint16(0);
      return {x, y}
    }
    reader.advance(segmentSize + 2)
    seenSegment++;
    if (seenSegment >= 1000) {
      return null;
    }
  }
}

const getImageSize2 = async (files: File[]): Promise<string> => {
  const start = window.performance.now()
  let log = "";
  const limit = pLimit(10)
  await Promise.all(files.map(file => limit(async () => {
    const result = await getImageSizeFromBlob(file)
    if (result !== null) {
      log += `${file.name}: ${result.x}x${result.y}\n`
    } else {
      log += `${file.name}: error\n`
    }
  })))
  const end = window.performance.now()
  log = `time: ${end - start}ms\n` + log
  console.log("end")
  return log
}

function App() {
  const [log, setLog] = useState<string>("");
  const [log2, setLog2] = useState<string>("");
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation();
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation();
    const items = e.dataTransfer.items;
    setLog("");
    setLog2("");
    (async () => {
      const files = await getFiles(items);
      setLog2(await getImageSize2(files))
      setLog(await getImageSize1(files))
    })()
  }

  return (
    <>
      <div style={{height: "50vh"}} onDrop={handleDrop} onDragOver={handleDragOver}>
        drop image here
      </div>
      <div style={{display: "flex"}}>
        <textarea readOnly style={{width: "50%", height: "50vh"}} value={log}></textarea>
        <textarea readOnly style={{width: "50%", height: "50vh"}} value={log2}></textarea>
      </div>
    </>
  )
}

export default App
