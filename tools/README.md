# Tools
### (...) under construction.

## Folder Structure

(...) under construction.

## Audacity

### Installation

1. Download and install from Windows App Store [here](https://apps.microsoft.com/detail/XP8K0J757HHRDW?hl=en-US&gl=PT&ocid=pdpshare).

### Usage

1. Drag and drop audio track into Audacity, normalize it by selecting the entire track or a portion of it, accessing Effect > Volume and Compression > Normalize set -1.0 dB as target and apply.
2. Drag and drop audio track into Audacity, remove background noise by first selecting an empty portion of the track, accessing Effect > Noise Removal and Repair > Noise Reduction > Get Noise Profile, then selecting the entire track or a portion of it, accessign Effect > Noise Removal and Repair > Noise Reduction and apply.

## FFMPEG

### Installation

1. Download binaries from [here](https://ffmpeg.org/download.html) and place binaries under "tools/ffmpeg/".
2. Make sure it is correctly installed by running ".\tools\ffmpeg\bin\ffmpeg.exe".

### Usage

1. Convert .mp3 files to .m4a (for faster seeks) with the following command: ".\tools\ffmpeg\bin\ffmpeg.exe -i <input.mp3> -c:a aac -b:a 192k <output.m4a>".
2. Convert .m4a files to .mp3 with the following command: ".\tools\ffmpeg\bin\ffmpeg.exe -i <input.m4a> -codec:a libmp3lame -qscale:a 2 <output.mp3>".
3. Convert .wav files to .mp3 with the following command: ".\tools\ffmpeg\bin\ffmpeg.exe -i <input.wav> -codec:a libmp3lame -b:a 320k <output.mp3>".

Note: FFMPEG is needed for YT-DLP to properly work.

## YT-DLP

### Installation

1. Download executable from [here](https://github.com/yt-dlp/yt-dlp) and place it under "tools/yt-dlp".
2. Make sure it is correctly installed by running ".\tools\yt-dlp\yt-dlp_x86.exe".

### Usage

1. Download any audio file from YouTube with the following command: ".\tools\yt-dlp\yt-dlp_x86.exe --ffmpeg-location .\tools\ffmpeg\bin\ -t mp3 --output <NAME> <URL>".