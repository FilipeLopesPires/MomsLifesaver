# Tools
### (...) under construction.

## Folder Structure

(...) under construction.

## FFMPEG

### Installation

1. Download binaries from [here](https://ffmpeg.org/download.html) and place binaries under "tools/ffmpeg/".
2. Make sure it is correctly installed by running ".\tools\ffmpeg\bin\ffmpeg.exe".

### Usage

1. Convert .m4a files to .mp3 with the following command: ".\tools\ffmpeg\bin\ffmpeg.exe -i <input.m4a> -codec:a libmp3lame -qscale:a 2 <output.mp3>".
2. Convert .wav files to .mp3 with the following command: ".\tools\ffmpeg\bin\ffmpeg.exe -i <input.wav> -codec:a libmp3lame -b:a 320k <output.mp3>".

Note: FFMPEG is needed for YT-DLP to properly work.

## YT-DLP

### Installation

1. Download executable from [here](https://github.com/yt-dlp/yt-dlp) and place it under "tools/yt-dlp".
2. Make sure it is correctly installed by running ".\tools\yt-dlp\yt-dlp_x86.exe".

### Usage

1. Download any audio file from YouTube with the following command: ".\tools\yt-dlp\yt-dlp_x86.exe --ffmpeg-location .\tools\ffmpeg\bin\ -t mp3 --output <NAME> <URL>".