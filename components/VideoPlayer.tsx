import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TimedLyric } from '../types';
import { generateVisualsForLyrics } from '../services/geminiService';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon';
import PrevIcon from './icons/PrevIcon';
import Loader from './Loader';
import KaraokeLyric from './KaraokeLyric';
import SparklesIcon from './icons/SparklesIcon';

declare global {
  interface Window {
    FFmpeg: any;
  }
}

interface AiImage {
  url: string;
  startTime: number;
  endTime: number;
}

interface VideoPlayerProps {
  timedLyrics: TimedLyric[];
  audioUrl: string;
  imageUrl: string;
  backgroundImage: File | null;
  duration: number;
  onBack: () => void;
  songTitle: string;
  artistName: string;
  isAiUnlocked: boolean;
}

const fonts = [
  { name: '思源黑體 (預設)', value: "'Noto Sans TC', sans-serif" },
  { name: '馬善政 (書法)', value: "'Ma Shan Zheng', cursive" },
  { name: '龍藏體 (手寫)', value: "'Long Cang', cursive" },
  { name: '快樂體 (可愛)', value: "'ZCOOL KuaiLe', sans-serif" },
  { name: '思源宋體 (優雅)', value: "'Noto Serif TC', serif" },
];

const { createFFmpeg, fetchFile } = window.FFmpeg;
const ffmpeg = createFFmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
});


const VideoPlayer: React.FC<VideoPlayerProps> = ({ timedLyrics, audioUrl, imageUrl, backgroundImage, duration, onBack, songTitle, artistName, isAiUnlocked }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  // FIX: Explicitly initialize useRef with null for better type safety and to prevent potential errors.
  const animationFrameRef = useRef<number | null>(null);
  
  const [artSize, setArtSize] = useState(40);
  const [fontFamily, setFontFamily] = useState(fonts[0].value);
  
  const [aiImages, setAiImages] = useState<AiImage[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiGenerationProgress, setAiGenerationProgress] = useState<{ message: string; progress: number } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ message: string; progress?: number } | null>(null);

  const handleAiGenerate = async () => {
    if (!isAiUnlocked) {
      alert("請先返回主畫面，點擊『天選之桶』解鎖 AI 功能！");
      return;
    }
    setIsGeneratingAi(true);
    setAiGenerationProgress({ message: '準備中...', progress: 0 });
    try {
      const images = await generateVisualsForLyrics(timedLyrics, songTitle, artistName, (progress, message) => {
        setAiGenerationProgress({ progress, message });
      });
      setAiImages(images);
    } catch(error) {
      console.error("AI image generation failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`AI影像生成失敗: ${message}`);
    } finally {
      setIsGeneratingAi(false);
      setAiGenerationProgress(null);
    }
  };


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const endedHandler = () => {
      setIsPlaying(false);
      setCurrentTime(duration);
    };
    audio.addEventListener('ended', endedHandler);
    return () => {
      audio.removeEventListener('ended', endedHandler);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [duration]);

  useEffect(() => {
    const animate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);
  
 const lyricLines = useMemo(() => {
    const realLyrics = timedLyrics.filter(l => l.text.trim() !== '');
    if (realLyrics.length === 0) {
      return { prev: null, current: null, next: null };
    }

    const currentIndex = realLyrics.findIndex(lyric => currentTime >= lyric.startTime && currentTime < lyric.endTime);

    if (currentTime < realLyrics[0].startTime) {
      return { prev: null, current: null, next: realLyrics[0] };
    }

    const lastLyric = realLyrics[realLyrics.length - 1];
    if (currentTime >= lastLyric.endTime) {
      return { prev: lastLyric, current: null, next: null };
    }

    if (currentIndex !== -1) {
      return {
        prev: realLyrics[currentIndex - 1] || null,
        current: realLyrics[currentIndex],
        next: realLyrics[currentIndex + 1] || null,
      };
    }
    
    let prevLyricIndex = -1;
    for(let i = realLyrics.length - 1; i >= 0; i--) {
        if(currentTime >= realLyrics[i].endTime) {
            prevLyricIndex = i;
            break;
        }
    }
    if (prevLyricIndex !== -1) {
        return {
            prev: realLyrics[prevLyricIndex],
            current: null,
            next: realLyrics[prevLyricIndex + 1] || null,
        }
    }

    return { prev: null, current: null, next: null };
  }, [currentTime, timedLyrics]);


  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (audioRef.current.currentTime >= duration - 0.1) {
          audioRef.current.currentTime = 0;
        }
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return isNaN(minutes) || isNaN(secs) ? '0:00' : `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress({ message: '準備匯出引擎...', progress: 0 });

    try {
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        setExportProgress({ message: '讀取音訊檔案...', progress: 5 });
        ffmpeg.FS('writeFile', 'input.mp3', await fetchFile(audioUrl));
        
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('無法取得 Canvas Context');

        const frameRate = 30;
        const totalFrames = Math.floor(duration * frameRate);

        // Preload images
        const allImageUrls = [imageUrl, ...aiImages.map(i => i.url)];
        const imageElements: { [key: string]: HTMLImageElement } = {};
        await Promise.all(allImageUrls.map(url => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    imageElements[url] = img;
                    resolve();
                };
                img.onerror = reject;
                img.src = url;
            });
        }));


        for (let i = 0; i < totalFrames; i++) {
            const frameTime = i / frameRate;
            
            const progress = 10 + Math.floor((i / totalFrames) * 80);
            setExportProgress({ message: `正在擷取畫面 ${i}/${totalFrames}`, progress });
            
            // --- Drawing logic copied and adapted for canvas ---
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const currentExportBgUrl = aiImages.length > 0
              ? (aiImages.find(img => frameTime >= img.startTime && frameTime < img.endTime)?.url || aiImages[0].url)
              : imageUrl;
            
            const bgImg = imageElements[currentExportBgUrl];
            if(bgImg) {
                const aspectRatio = bgImg.width / bgImg.height;
                let drawWidth = canvas.width;
                let drawHeight = canvas.width / aspectRatio;
                if (drawHeight < canvas.height) {
                    drawHeight = canvas.height;
                    drawWidth = canvas.height * aspectRatio;
                }
                ctx.drawImage(bgImg, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
            }
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const artWidthPx = canvas.width * (artSize / 100);
            const lyricsWidthPx = canvas.width - artWidthPx;
            const artImg = imageElements[imageUrl];
            if (artImg) {
                ctx.drawImage(artImg, 30, (canvas.height - artWidthPx) / 2, artWidthPx - 60, artWidthPx - 60);
            }
            
            // Lyrics
            const currentLyricLines = (() => {
                const realLyrics = timedLyrics.filter(l => l.text.trim() !== '');
                 if (realLyrics.length === 0) return { prev: null, current: null, next: null };
                const currentIndex = realLyrics.findIndex(lyric => frameTime >= lyric.startTime && frameTime < lyric.endTime);
                if (frameTime < realLyrics[0].startTime) return { prev: null, current: null, next: realLyrics[0] };
                const lastLyric = realLyrics[realLyrics.length - 1];
                if (frameTime >= lastLyric.endTime) return { prev: lastLyric, current: null, next: null };
                if (currentIndex !== -1) return { prev: realLyrics[currentIndex - 1] || null, current: realLyrics[currentIndex], next: realLyrics[currentIndex + 1] || null };
                let prevLyricIndex = -1;
                for (let i = realLyrics.length - 1; i >= 0; i--) { if (frameTime >= realLyrics[i].endTime) { prevLyricIndex = i; break; } }
                if (prevLyricIndex !== -1) return { prev: realLyrics[prevLyricIndex], current: null, next: realLyrics[prevLyricIndex + 1] || null };
                return { prev: null, current: null, next: null };
            })();
            
            ctx.save();
            ctx.translate(artWidthPx + (lyricsWidthPx / 2), canvas.height / 2);
            ctx.rotate(-5 * Math.PI / 180);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fontSize = 48;
            
            // prev
            ctx.font = `bold ${fontSize * 0.6}px ${fontFamily}`;
            ctx.fillStyle = 'rgba(209, 213, 219, 0.7)'; // gray-300
            ctx.fillText(currentLyricLines.prev?.text || '', 0, -fontSize * 1.5);
            
            // current
            if (currentLyricLines.current) {
                const currentText = currentLyricLines.current.text;
                const karaokeProgress = (frameTime - currentLyricLines.current.startTime) / (currentLyricLines.current.endTime - currentLyricLines.current.startTime);
                
                ctx.font = `bold ${fontSize}px ${fontFamily}`;
                
                // Base
                ctx.fillStyle = 'rgba(156, 163, 175, 1)'; // gray-400
                ctx.fillText(currentText, 0, 0);

                // Highlight
                const textWidth = ctx.measureText(currentText).width;
                const gradient = ctx.createLinearGradient(-textWidth / 2, 0, textWidth / 2, 0);
                gradient.addColorStop(0, '#fde047'); // yellow-300
                gradient.addColorStop(0.5, '#ffffff'); // white
                gradient.addColorStop(1, '#fbbf24'); // yellow-400
                ctx.fillStyle = gradient;
                
                ctx.save();
                ctx.beginPath();
                ctx.rect(-textWidth / 2, -fontSize, textWidth * karaokeProgress, fontSize * 2);
                ctx.clip();
                ctx.fillText(currentText, 0, 0);
                ctx.restore();
            }

            // next
            ctx.font = `bold ${fontSize * 0.6}px ${fontFamily}`;
            ctx.fillStyle = 'rgba(209, 213, 219, 0.7)';
            ctx.fillText(currentLyricLines.next?.text || '', 0, fontSize * 1.5);

            ctx.restore();
            // --- End drawing logic ---
            
            const frameData = canvas.toDataURL('image/jpeg', 0.8);
            const frameNum = String(i).padStart(5, '0');
            ffmpeg.FS('writeFile', `frame-${frameNum}.jpg`, await fetchFile(frameData));
        }

        setExportProgress({ message: '正在編碼影片...', progress: 90 });
        await ffmpeg.run('-framerate', String(frameRate), '-i', 'frame-%05d.jpg', '-i', 'input.mp3', '-c:v', 'libx264', '-c:a', 'aac', '-strict', 'experimental', '-b:a', '192k', '-shortest', '-pix_fmt', 'yuv420p', 'output.mp4');

        setExportProgress({ message: '完成！準備下載...', progress: 99 });
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${songTitle} - ${artistName}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        
        // Cleanup
        for (let i = 0; i < totalFrames; i++) {
             ffmpeg.FS('unlink', `frame-${String(i).padStart(5, '0')}.jpg`);
        }
        ffmpeg.FS('unlink', 'input.mp3');
        ffmpeg.FS('unlink', 'output.mp4');

    } catch (err) {
        console.error(err);
        alert(`匯出失敗: ${err}`);
    } finally {
        setIsExporting(false);
        setExportProgress(null);
    }
};

  const baseLyricClass = 'font-bold drop-shadow-lg';
  const highlightLyricClass = 'bg-gradient-to-r from-yellow-300 via-white to-yellow-400 bg-clip-text text-transparent';
      
  const currentBg = useMemo(() => {
    if (aiImages.length === 0) return { current: imageUrl, next: null, blend: 0 };
    const currentImageIndex = aiImages.findIndex(img => currentTime >= img.startTime && currentTime < img.endTime);
    const current = aiImages[currentImageIndex] || aiImages[0];
    return { current: current?.url || imageUrl, next: null, blend: 0 };
  }, [currentTime, aiImages, imageUrl]);

  return (
    <>
      {isGeneratingAi && aiGenerationProgress && <Loader message={aiGenerationProgress.message} progress={aiGenerationProgress.progress} />}
      {isExporting && exportProgress && <Loader message={exportProgress.message} progress={exportProgress.progress} />}
      
      <div className="w-full max-w-7xl mx-auto flex flex-col h-screen bg-black rounded-xl overflow-hidden border border-yellow-500/30">
        <div className="flex-grow relative">
            <div className="absolute inset-0">
                <img src={currentBg.current} className="w-full h-full object-cover transition-opacity duration-1000" alt="背景"/>
                <div className="absolute inset-0 bg-black/60"></div>
            </div>
            
            <div className="absolute inset-0 flex flex-col p-4 sm:p-8">
                <div 
                  className={`flex-grow flex flex-col md:flex-row gap-8 items-center justify-center`}
                  style={{ '--art-width': `${artSize}%`, '--lyrics-width': `${100 - artSize}%` } as React.CSSProperties}
                >
                    <div className="w-4/5 md:w-[var(--art-width)] flex-shrink-0 transition-all duration-300 ease-in-out">
                        <img src={imageUrl} alt="專輯封面" className="w-full aspect-square object-cover rounded-xl shadow-2xl ring-1 ring-yellow-500/30"/>
                    </div>

                    <div className={`w-full md:w-[var(--lyrics-width)] h-64 flex items-center justify-center overflow-hidden transition-all duration-300 ease-in-out`}>
                        <div 
                          key={lyricLines.current?.startTime || 'start'}
                          className={`w-full text-center text-white flex flex-col justify-center items-center gap-4 animate-fade-in`}
                          style={{transform: 'rotate(-5deg)', textShadow: '0 0 8px rgba(0,0,0,0.7)'}}
                        >
                          <p 
                            className={`transition-opacity duration-300 ${baseLyricClass} text-gray-300 ${lyricLines.prev ? 'opacity-70' : 'opacity-0'}`}
                            style={{ fontSize: `36px`, fontFamily: fontFamily, }}>
                              {lyricLines.prev?.text || ' '}
                          </p>

                          {lyricLines.current ? (
                            <KaraokeLyric
                              key={lyricLines.current.startTime}
                              text={lyricLines.current.text}
                              duration={(lyricLines.current.endTime - lyricLines.current.startTime) * 1000}
                              isPlaying={isPlaying}
                              style={{ fontSize: `60px`, fontFamily: fontFamily, minHeight: `${60 * 1.2}px` }}
                              className={baseLyricClass}
                              highlightClassName={highlightLyricClass}
                            />
                           ) : (
                            <p 
                              className={baseLyricClass}
                              style={{ fontSize: `60px`, fontFamily: fontFamily, minHeight: `${60 * 1.2}px` }}>
                                {' '}
                            </p>
                           )}

                          <p 
                            className={`transition-opacity duration-300 ${baseLyricClass} text-gray-300 ${lyricLines.next ? 'opacity-70' : 'opacity-0'}`}
                              style={{ fontSize: `36px`, fontFamily: fontFamily, }}>
                              {lyricLines.next?.text || ' '}
                          </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <audio ref={audioRef} src={audioUrl} onLoadedMetadata={() => setCurrentTime(0)} />
        
        <div className="flex-shrink-0 p-4 bg-black/70 backdrop-blur-sm border-t border-yellow-700/50 space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.01"
              value={currentTime}
              onChange={handleTimelineChange}
              className="w-full h-2 bg-yellow-900/50 border border-yellow-800/50 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
            <span className="text-white text-sm font-mono">{formatTime(duration)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-white text-sm items-center">
              <div className="flex items-center gap-3">
                  <label htmlFor="art-size-slider" className="font-semibold text-yellow-300 whitespace-nowrap">封面大小</label>
                  <input
                    id="art-size-slider"
                    type="range"
                    min="20"
                    max="70"
                    value={artSize}
                    onChange={(e) => setArtSize(Number(e.target.value))}
                    className="w-full h-1.5 bg-yellow-900/50 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                  />
                  <span className="font-mono w-12 text-center text-yellow-400">{artSize}%</span>
              </div>
              <div className="flex items-center gap-3">
                  <label htmlFor="font-family-select" className="font-semibold text-yellow-300 whitespace-nowrap">歌詞字體</label>
                  <select
                    id="font-family-select"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full px-3 py-1.5 text-gray-200 bg-black/50 border border-yellow-700/50 rounded-md focus:ring-yellow-500 focus:border-yellow-500 transition"
                  >
                    {fonts.map(font => (
                      <option key={font.value} value={font.value} style={{fontFamily: font.value}}>
                        {font.name}
                      </option>
                    ))}
                  </select>
              </div>
          </div>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
              <button onClick={onBack} className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm sm:text-base">
                  <PrevIcon className="w-6 h-6" />
                  返回計時
              </button>
              <div className="flex items-center gap-4">
                <button onClick={handlePlayPause} className="bg-white text-gray-900 rounded-full p-3 transform hover:scale-110 transition-transform shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                    {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                </button>
                <div className="flex flex-col items-center">
                    <button 
                        onClick={handleAiGenerate}
                        disabled={!isAiUnlocked || isGeneratingAi || aiImages.length > 0}
                        title={!isAiUnlocked ? "請返回主畫面，點擊『天選之桶』解鎖" : (aiImages.length > 0 ? "動畫已生成完畢" : "使用 AI 生成動態背景")}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                            isAiUnlocked 
                            ? 'bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none' 
                            : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                        }`}
                        style={{boxShadow: '0 0 10px rgba(252, 211, 77, 0.6)'}}
                    >
                        <SparklesIcon className="w-5 h-5" />
                        <span>{aiImages.length > 0 ? '動畫已生成' : 'AI 動畫生成'}</span>
                    </button>
                     <p className="text-xs text-gray-500 mt-1">
                        {isAiUnlocked ? 'AI 將根據歌詞意境生成動態背景' : '功能已鎖定，請返回主頁解鎖'}
                     </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <button onClick={handleExport} className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-[0_0_10px_rgba(59,130,246,0.6)]">
                    導出 MP4
                </button>
              </div>
          </div>
        </div>

        <style>{`
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
          
          @keyframes karaoke-reveal {
            from { clip-path: inset(0 100% 0 0); }
            to   { clip-path: inset(0 0 0 0); }
          }
        `}</style>
      </div>
    </>
  );
};

export default VideoPlayer;