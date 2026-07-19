import { useRef } from 'react'

export interface UploadControlProps {
  onFile: (file: File) => void
}

export function UploadControl({ onFile }: UploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="upload-button"
        onClick={() => inputRef.current?.click()}
      >
        Upload IGC
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".igc,.IGC,application/octet-stream,text/plain"
        className="visually-hidden"
        aria-label="Upload IGC file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.target.value = ''
        }}
      />
    </>
  )
}
