import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEraser,
  faFolderOpen,
  faPaperPlane,
  faPlay,
  faStop,
  faVideo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { readFile } from '@tauri-apps/plugin-fs';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ContentSendInfo, TabContext } from './common';

type VideoScaleMode = 'contain' | 'cover' | 'stretch';

export const VideoTab: React.FC<TabContext> = ({
  width,
  height,
  onSend,
  onPreview,
  onClearDisplay,
  busy,
}) => {
  const [fps, setFps] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(0);
  const [scaleMode, setScaleMode] = useState<VideoScaleMode>('contain');
  const [sentFrames, setSentFrames] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [lastFrameMs, setLastFrameMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stoppedRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const onSendRef = useRef(onSend);
  const onPreviewRef = useRef(onPreview);
  const settingsRef = useRef({ width, height, fps, loop, segmentStart, segmentEnd, scaleMode });

  useEffect(() => {
    onSendRef.current = onSend;
    onPreviewRef.current = onPreview;
    settingsRef.current = { width, height, fps, loop, segmentStart, segmentEnd, scaleMode };
  }, [fps, height, loop, onPreview, onSend, scaleMode, segmentEnd, segmentStart, width]);

  const replaceUrl = useCallback((url: string, name: string) => {
    setVideoURL((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setVideoName(name);
    setCurrentTime(0);
    setSentFrames(0);
    setDroppedFrames(0);
  }, []);

  const handleFile = useCallback(
    (file?: File | null) => {
      if (!file) return;
      replaceUrl(URL.createObjectURL(file), file.name);
    },
    [replaceUrl]
  );

  useEffect(() => {
    const webview = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    void webview
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type !== 'drop' || !payload.paths.length) return;
        const path = payload.paths[0];
        const extension = path.split('.').pop()?.toLowerCase() ?? '';
        const mime: Record<string, string> = {
          mp4: 'video/mp4',
          m4v: 'video/mp4',
          webm: 'video/webm',
          ogg: 'video/ogg',
          ogv: 'video/ogg',
          mov: 'video/quicktime',
          avi: 'video/x-msvideo',
        };
        if (!mime[extension]) return;
        try {
          replaceUrl(
            URL.createObjectURL(new Blob([await readFile(path)], { type: mime[extension] })),
            path.split(/[/\\]/).pop() ?? 'video'
          );
        } catch (error) {
          console.error('Failed to read dropped video:', error);
        }
      })
      .then((dispose) => {
        unlisten = dispose;
      });
    return () => unlisten?.();
  }, [replaceUrl]);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (videoURL) URL.revokeObjectURL(videoURL);
    },
    [videoURL]
  );

  const captureFrame = useCallback((video: HTMLVideoElement) => {
    const { width: targetWidth, height: targetHeight, scaleMode: mode } = settingsRef.current;
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    if (mode === 'stretch') ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    else {
      const ratio =
        mode === 'cover'
          ? Math.max(targetWidth / video.videoWidth, targetHeight / video.videoHeight)
          : Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
      const drawWidth = video.videoWidth * ratio;
      const drawHeight = video.videoHeight * ratio;
      ctx.drawImage(
        video,
        (targetWidth - drawWidth) / 2,
        (targetHeight - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    }
    return canvas;
  }, []);

  const previewCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = captureFrame(video);
    if (!canvas) return;
    onPreviewRef.current({
      canvas,
      description: `视频待发送帧 @ ${video.currentTime.toFixed(2)}s`,
      bgColor: '#000000',
    });
    setCurrentTime(video.currentTime);
  }, [captureFrame]);

  const scheduleNextFrame = useCallback(async () => {
    if (stoppedRef.current) return;
    const video = videoRef.current;
    if (!video) {
      stoppedRef.current = true;
      setPlaying(false);
      return;
    }
    const settings = settingsRef.current;
    if (video.ended && settings.loop) {
      video.currentTime = settings.segmentStart;
      await video.play();
    } else if (video.paused || video.ended) {
      stoppedRef.current = true;
      setPlaying(false);
      return;
    }
    const effectiveEnd =
      settings.segmentEnd > settings.segmentStart ? settings.segmentEnd : video.duration;
    if (video.currentTime >= effectiveEnd) {
      if (settings.loop) video.currentTime = settings.segmentStart;
      else {
        video.pause();
        stoppedRef.current = true;
        setPlaying(false);
        return;
      }
    }
    const canvas = captureFrame(video);
    let frameElapsed = 0;
    if (canvas) {
      const info: ContentSendInfo = {
        canvas,
        description: `视频帧 @ ${video.currentTime.toFixed(2)}s`,
        bgColor: '#000000',
        transient: true,
        silent: true,
      };
      onPreviewRef.current(info);
      const startedAt = performance.now();
      const result = await onSendRef.current(info);
      const elapsed = performance.now() - startedAt;
      frameElapsed = elapsed;
      setLastFrameMs(elapsed);
      if (result.status === 'cancelled') {
        video.pause();
        stoppedRef.current = true;
        setPlaying(false);
        return;
      }
      if (result.status === 'sent') {
        setSentFrames((value) => value + 1);
        const missed = Math.max(0, Math.floor(elapsed / (1000 / settings.fps)) - 1);
        if (missed) setDroppedFrames((value) => value + missed);
      } else if (result.status === 'busy') setDroppedFrames((value) => value + 1);
    }
    setCurrentTime(video.currentTime);
    if (!stoppedRef.current) {
      const delay = Math.max(0, 1000 / settings.fps - frameElapsed);
      timerRef.current = window.setTimeout(() => void scheduleNextFrame(), delay);
    }
  }, [captureFrame]);

  const handlePlay = async () => {
    const video = videoRef.current;
    if (!video || !videoURL) return;
    stoppedRef.current = false;
    if (
      video.currentTime < segmentStart ||
      (segmentEnd > segmentStart && video.currentTime >= segmentEnd)
    )
      video.currentTime = segmentStart;
    video.muted = true;
    await video.play();
    setPlaying(true);
    void scheduleNextFrame();
  };
  const handleStop = () => {
    stoppedRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    videoRef.current?.pause();
    setPlaying(false);
  };
  const handleClear = () => {
    handleStop();
    setVideoURL((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setVideoName('');
    setDuration(0);
    setCurrentTime(0);
    onPreview(null);
  };
  const sendOneFrame = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = captureFrame(video);
    if (canvas)
      await onSend({
        canvas,
        description: `视频单帧 @ ${video.currentTime.toFixed(2)}s`,
        bgColor: '#000000',
        metadata: {
          类型: '视频单帧',
          文件: videoName,
          时间: `${video.currentTime.toFixed(2)}s`,
          布局: scaleMode,
          目标帧率: fps,
        },
      });
  };
  const formatTime = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

  return (
    <div className="sdt-tab-form">
      <div className="sdt-toolbar-row">
        <label>
          目标帧率
          <input
            type="range"
            className="sdt-range"
            min={1}
            max={30}
            value={fps}
            onChange={(event) => setFps(Number(event.target.value))}
          />
        </label>
        <span className="mono">{fps} fps</span>
        <label>
          布局
          <select
            className="sdt-select"
            value={scaleMode}
            onChange={(event) => setScaleMode(event.target.value as VideoScaleMode)}
          >
            <option value="contain">等比完整</option>
            <option value="cover">填充裁剪</option>
            <option value="stretch">拉伸</option>
          </select>
        </label>
        <span className="sdt-spacer" />
        <button className="sdt-btn" onClick={() => fileInputRef.current?.click()}>
          <FontAwesomeIcon icon={faFolderOpen} /> 视频
        </button>
        <button className="sdt-btn" onClick={handleClear} disabled={!videoURL}>
          <FontAwesomeIcon icon={faXmark} /> 清空
        </button>
        <button
          className="sdt-btn sdt-clear-screen-btn"
          onClick={() => void onClearDisplay()}
          disabled={busy}
        >
          <FontAwesomeIcon icon={faEraser} /> 清屏
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      <details className="sdt-advanced-panel">
        <summary>高级视频设置</summary>
        <div className="sdt-advanced-content">
          <div className="sdt-toolbar-row">
            <label className="sdt-check">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
              />
              循环指定片段
            </label>
          </div>
          <div className="sdt-toolbar-row sdt-parameter-grid">
            <label>
              片段开始
              <input
                className="sdt-input mono"
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={segmentStart}
                onChange={(event) => setSegmentStart(Number(event.target.value))}
              />
            </label>
            <label>
              片段结束
              <input
                className="sdt-input mono"
                type="number"
                min={0}
                max={duration}
                step={0.1}
                value={segmentEnd}
                onChange={(event) => setSegmentEnd(Number(event.target.value))}
              />
            </label>
            <span>
              已发送 <strong>{sentFrames}</strong> 帧
            </span>
            <span>
              跳过 <strong>{droppedFrames}</strong> 帧
            </span>
            <span>
              单帧 <strong>{lastFrameMs.toFixed(0)} ms</strong>
            </span>
            <span>
              实测 <strong>{lastFrameMs ? (1000 / lastFrameMs).toFixed(1) : '0'} fps</strong>
            </span>
          </div>
        </div>
      </details>

      <div className="sdt-video-pick">
        {videoURL ? (
          <video
            ref={videoRef}
            src={videoURL}
            controls={false}
            onLoadedMetadata={(event) => {
              const value = event.currentTarget.duration || 0;
              setDuration(value);
              setSegmentEnd(value);
              previewCurrentFrame();
            }}
            onLoadedData={previewCurrentFrame}
            onSeeked={previewCurrentFrame}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          />
        ) : (
          <button className="sdt-drop-placeholder" onClick={() => fileInputRef.current?.click()}>
            <FontAwesomeIcon icon={faVideo} className="icon" />
            <span>
              <FontAwesomeIcon icon={faFolderOpen} /> 选择 MP4 / WEBM / MOV 文件
            </span>
            <small>播放时按 SPI 实际速度自动节流</small>
          </button>
        )}
        {videoURL && <div className="sub-hint">{videoName}</div>}
      </div>

      <div className="sdt-video-progress">
        <input
          className="sdt-video-seek"
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => {
            const video = videoRef.current;
            if (video) video.currentTime = Number(event.target.value);
          }}
        />
        <div className="sdt-progress-info">
          <span>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span>{duration ? ((currentTime / duration) * 100).toFixed(0) : 0}%</span>
        </div>
        <div className="sdt-video-actions">
          <button
            className="sdt-btn success"
            onClick={() => void handlePlay()}
            disabled={!videoURL || playing}
          >
            <FontAwesomeIcon icon={faPlay} /> 播放发送
          </button>
          <button className="sdt-btn danger" onClick={handleStop} disabled={!playing}>
            <FontAwesomeIcon icon={faStop} /> 停止
          </button>
          <button
            className="sdt-btn primary"
            onClick={() => void sendOneFrame()}
            disabled={!videoURL || playing || busy}
          >
            <FontAwesomeIcon icon={faPaperPlane} /> 发送当前帧
          </button>
        </div>
      </div>
    </div>
  );
};
