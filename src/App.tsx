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
  for (const file of files) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise<void>(resolve => {
      img.onload = () => {
        log += `${file.name}: ${img.width}x${img.height}\n`
        resolve()
      }
    })
  }
  const end = window.performance.now()
  log += `time: ${end - start}ms`
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
    (async () => {
      const files = await getFiles(items);
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
