# Tools
### (...) under construction.

## Folder Structure

(...) under construction.

## FFMPEG

1. Download binaries from [here](https://ffmpeg.org/download.html) and place binaries under "tools/ffmpeg/".
2. Make sure it is correctly installed by running ".\tools\ffmpeg\bin\ffmpeg.exe".

## YT-DLP

1. Download executable from [here](https://github.com/yt-dlp/yt-dlp) and place it under "tools/yt-dlp".
2. Make sure it is correctly installed by running ".\tools\yt-dlp\yt-dlp_x86.exe".
3. Download any audio file from YouTube with the following command: ".\tools\yt-dlp\yt-dlp_x86.exe --ffmpeg-location .\tools\ffmpeg\bin\ -t mp3 --output <NAME> <URL>"