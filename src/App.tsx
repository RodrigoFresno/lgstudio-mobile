import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import styles from './App.module.scss';
import {
  createEmptyTexture,
  loadTextureFromURL,
  MultiPassRenderer,
  updateVideoTexture,
} from './utils/GLUtils';
import type { IMultiPassRenderer, ITextureHandle } from './utils/RendererInterface';
import {
  GPUMultiPassRenderer,
  gpuLoadTextureFromURL,
  gpuCreateEmptyTexture,
  gpuUpdateVideoTexture,
} from './utils/GPUUtils';
import { detectWebGPU, type WebGPUDetectResult } from './utils/gpuDetect';
import { ResizableWindow } from './components/ResizableWindow';
import type { ResizeWindowCtrlRefType } from './components/ResizableWindow/ResizableWindow';

import VertexShader from './shaders/vertex.glsl';
import FragmentBgShader from './shaders/fragment-bg.glsl';
import FragmentBgVblurShader from './shaders/fragment-bg-vblur.glsl';
import FragmentBgHblurShader from './shaders/fragment-bg-hblur.glsl';
import FragmentMainShader from './shaders/fragment-main.glsl';
import WgslVertex from './shaders-wgsl/vertex.wgsl';
import WgslFragBg from './shaders-wgsl/fragment-bg.wgsl';
import WgslFragVblur from './shaders-wgsl/fragment-bg-vblur.wgsl';
import WgslFragHblur from './shaders-wgsl/fragment-bg-hblur.wgsl';
import WgslFragMain from './shaders-wgsl/fragment-main.wgsl';
import { Controller } from '@react-spring/web';

// import { useResizeObserver } from './utils/useResizeOberver';
import clsx from 'clsx';
import { capitalize, computeGaussianKernelByRadius } from './utils';

import bgGrid from '@/assets/bg-grid.png';
import bgBars from '@/assets/bg-bars.png';
import bgHalf from '@/assets/bg-half.png';
import bgTimcook from '@/assets/bg-timcook.png';
import bgUI from '@/assets/bg-ui.svg';
import bgTahoeLightImg from '@/assets/bg-tahoe-light.webp';
import bgText from '@/assets/bg-text.jpg';
import bgBuildings from '@/assets/bg-buildings.png';
import bgVideoFish from '@/assets/bg-video-fish.mp4';
import bgVideo2 from '@/assets/bg-video-2.mp4';
import bgVideo3 from '@/assets/bg-video-3.mp4';

import XIcon from '@mui/icons-material/X';
import GitHubIcon from '@mui/icons-material/GitHub';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { useLevaControls } from './Controls';
import { PresetControls } from './components/PresetControls/PresetControls';
import { EditorPanel, type InteractionMode, type ShapePreset } from './EditorPanel';


function waitForFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const next = () => {
      if (count-- <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  });
}


function traceSuperellipseShape(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  radius: number,
  exponent: number,
) {
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.max(0, Math.min(radius, halfW, halfH));
  if (r < 0.75) {
    ctx.rect(centerX - halfW, centerY - halfH, width, height);
    return;
  }
  const power = 2 / Math.max(2, exponent);
  const corners = [
    { x: centerX + halfW - r, y: centerY - halfH + r, start: -Math.PI / 2 },
    { x: centerX + halfW - r, y: centerY + halfH - r, start: 0 },
    { x: centerX - halfW + r, y: centerY + halfH - r, start: Math.PI / 2 },
    { x: centerX - halfW + r, y: centerY - halfH + r, start: Math.PI },
  ];
  corners.forEach((corner, cornerIndex) => {
    for (let step = 0; step <= 24; step++) {
      const angle = corner.start + (Math.PI / 2) * (step / 24);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = corner.x + Math.sign(cos) * Math.pow(Math.abs(cos), power) * r;
      const y = corner.y + Math.sign(sin) * Math.pow(Math.abs(sin), power) * r;
      if (cornerIndex === 0 && step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
}

function getInitialCanvasSize() {
  const mobile = window.innerWidth <= 760;
  const availableWidth = window.innerWidth - (mobile ? 32 : 80);
  const availableHeight = window.innerHeight * 0.58 - (mobile ? 80 : 110);
  // No celular, o canvas fica compacto na faixa de prévia entre o cabeçalho
  // dos controles e a gaveta inferior, sem ficar escondido atrás dela.
  return Math.max(mobile ? 140 : 280, Math.min(availableWidth, availableHeight, mobile ? window.innerWidth * 0.72 : window.innerHeight * 0.52));
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialCanvasSize = getInitialCanvasSize();
  const [canvasInfo, setCanvasInfo] = useState<{ width: number; height: number; dpr: number }>({
    width: initialCanvasSize,
    height: initialCanvasSize,
    dpr: window.devicePixelRatio || 1,
  });
  const [shapePreset, setShapePreset] = useState<ShapePreset>('squircle');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('center');
  const [shapePosition, setShapePosition] = useState({
    x: initialCanvasSize / 2,
    y: initialCanvasSize / 2,
  });
  const shapePositionRef = useRef(shapePosition);
  shapePositionRef.current = shapePosition;
  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  interactionModeRef.current = interactionMode;
  const draggingShapeRef = useRef(false);
  const [iconSrc, setIconSrc] = useState<string | null>(null);
  const [iconName, setIconName] = useState('');
  const [iconSize, setIconSize] = useState(52);
  const [iconOpacity, setIconOpacity] = useState(100);
  const [iconOffsetX, setIconOffsetX] = useState(0);
  const [iconOffsetY, setIconOffsetY] = useState(0);
  const [exportSize, setExportSize] = useState(4096);
  const [isExporting, setIsExporting] = useState(false);

  // WebGPU detection
  const [webgpuDetect, setWebgpuDetect] = useState<WebGPUDetectResult | null>(null);
  // O renderizador WebGL é selecionado automaticamente para manter a mesma saída em desktop e celular.
  const rendererBackend: 'webgl' | 'webgpu' = 'webgl';
  // Incrementing key forces React to remount the <canvas>, giving us a fresh element
  // with no prior context (needed because WebGL/WebGPU contexts are mutually exclusive)
  const canvasKey = 0;

  useEffect(() => {
    detectWebGPU().then(setWebgpuDetect);
  }, []);

  const { controls, lang, langName, levaGlobal, controlsAPI } = useLevaControls({
    containerRender: {
      /* eslint-disable react-hooks/rules-of-hooks */
      bgType: ({ value, setValue }) => {
        const [customFileType, setCustomFileType] = useState<null | 'image' | 'video'>(null);
        const [customFile, setCustomFile] = useState<null | File>(null);
        const [customFileUrl, setCustomFileUrl] = useState<null | string>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);

        return (
          <div className={styles.bgSelect}>
            {[
              { v: 11, media: '', loadTexture: true, type: 'custom' as const },
              { v: 0, media: bgGrid, loadTexture: false },
              { v: 1, media: bgBars, loadTexture: false },
              { v: 2, media: bgHalf, loadTexture: false },
              { v: 3, media: bgTahoeLightImg, loadTexture: true },
              { v: 4, media: bgBuildings, loadTexture: true },
              { v: 5, media: bgText, loadTexture: true },
              { v: 6, media: bgTimcook, loadTexture: true },
              { v: 7, media: bgUI, loadTexture: true },
              { v: 8, media: bgVideoFish, loadTexture: true, type: 'video' as const },
              { v: 9, media: bgVideo2, loadTexture: true, type: 'video' as const },
              { v: 10, media: bgVideo3, loadTexture: true, type: 'video' as const },
            ].map(({ v, media, loadTexture, type }) => {
              const mediaType = type === 'custom' ? customFileType : (type ?? 'image');
              const mediaUrl = type === 'custom' ? customFileUrl : media;
              return (
                <div
                  className={clsx(
                    styles.bgSelectItem,
                    styles[`bgSelectItemType${capitalize(type ?? 'image')}`],
                    {
                      [styles.bgSelectItemActive]: value === v,
                    },
                  )}
                  // style={{ backgroundImage: !type ? `url(${media})` : '' }}
                  key={v}
                  onClick={() => {
                    if (type === 'custom') {
                      if (!mediaUrl) {
                        fileInputRef.current?.click();
                      } else if (value === v) {
                        fileInputRef.current?.click();
                      }
                    }
                    setValue(v);
                    if (loadTexture && mediaUrl) {
                      stateRef.current.bgTextureUrl = mediaUrl;
                      if (mediaType === 'video') {
                        stateRef.current.bgTextureType = 'video';
                      } else {
                        stateRef.current.bgTextureType = 'image';
                      }
                    } else {
                      stateRef.current.bgTextureUrl = null;
                      stateRef.current.bgTextureReady = false;
                    }
                  }}
                >
                  {mediaUrl &&
                    (mediaType === 'video' ? (
                      <video
                        playsInline
                        muted={true}
                        loop
                        className={styles.bgSelectItemVideo}
                        ref={(ref) => {
                          if (ref) {
                            stateRef.current.bgVideoEls.set(v, ref);
                          } else {
                            stateRef.current.bgVideoEls.delete(v);
                          }
                        }}
                      >
                        <source src={mediaUrl}></source>
                      </video>
                    ) : mediaType === 'image' ? (
                      <img src={mediaUrl} className={styles.bgSelectItemImg} />
                    ) : null)}
                  {type === 'custom' ? (
                    <>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        ref={fileInputRef}
                        multiple={false}
                        onChange={(e) => {
                          if (!e.target.files?.[0]) {
                            return;
                          }
                          setCustomFile(e.target.files[0]);
                          if (customFileUrl) {
                            URL.revokeObjectURL(customFileUrl);
                          }
                          const newUrl = URL.createObjectURL(e.target.files[0]);
                          setCustomFileUrl(newUrl);
                          const fileType = e.target.files[0].type.startsWith('image/')
                            ? 'image'
                            : 'video';
                          setCustomFileType(fileType);
                          setValue(v);
                          stateRef.current.bgTextureUrl = newUrl;
                          if (fileType === 'video') {
                            stateRef.current.bgTextureType = 'video';
                          } else {
                            stateRef.current.bgTextureType = 'image';
                          }
                        }}
                      ></input>
                      <FileUploadOutlinedIcon />
                    </>
                  ) : null}
                  <div
                    className={clsx(
                      styles.bgSelectItemOverlay,
                      styles[`bgSelectItemOverlay${capitalize(type ?? 'image')}`],
                    )}
                  >
                    {mediaType === 'video' && (
                      <PlayCircleOutlinedIcon
                        className={styles.bgSelectItemVideoIcon}
                        style={{
                          opacity: value !== v ? 1 : 0,
                        }}
                      />
                    )}
                    {type === 'custom' && (
                      <div className={styles.bgSelectItemCustomIcon}>
                        <FileUploadOutlinedIcon />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      },
      /* eslint-enable react-hooks/rules-of-hooks */
    },
  });

  const stateRef = useRef<{
    canvasWindowCtrlRef: ResizeWindowCtrlRefType | null;
    renderRaf: number | null;
    canvasInfo: typeof canvasInfo;
    glStates: {
      gl: WebGL2RenderingContext;
      programs: Record<string, WebGLProgram>;
      vao: WebGLVertexArrayObject;
    } | null;
    canvasPos: { x: number; y: number };
    canvasPointerPos: { x: number; y: number };
    controls: typeof controls;
    blurWeights: number[];
    renderScale: number;
    lastMouseSpringValue: { x: number; y: number };
    lastMouseSpringTime: null | number;
    mouseSpring: Controller<{ x: number; y: number }>;
    mouseSpringSpeed: { x: number; y: number };
    bgTextureUrl: string | null;
    bgTexture: ITextureHandle | null;
    bgTextureRatio: number;
    bgTextureType: 'image' | 'video' | null;
    bgTextureReady: boolean;
    iconTexture: ITextureHandle | null;
    iconTextureReady: boolean;
    iconTextureRatio: number;
    iconSize: number;
    iconOpacity: number;
    iconOffsetX: number;
    iconOffsetY: number;
    bgVideoEls: Map<number, HTMLVideoElement>;
    langName: typeof langName;
    rendererBackend: 'webgl' | 'webgpu';
    activeRenderer: IMultiPassRenderer | null;
    gpuDevice: GPUDevice | null;
  }>({
    canvasWindowCtrlRef: null,
    renderRaf: null,
    glStates: null,
    canvasInfo,
    canvasPos: {
      x: 0,
      y: 0,
    },
    canvasPointerPos: {
      x: canvasInfo.width * 0.5,
      y: canvasInfo.height * 0.5,
    },
    controls,
    blurWeights: [],
    renderScale: 1,
    lastMouseSpringValue: {
      x: 0,
      y: 0,
    },
    lastMouseSpringTime: null,
    mouseSpring: new Controller({
      x: 0,
      y: 0,
      onChange: (c) => {
        if (!stateRef.current.lastMouseSpringTime) {
          stateRef.current.lastMouseSpringTime = Date.now();
          stateRef.current.lastMouseSpringValue = c.value;
          return;
        }

        const now = Date.now();
        const lastValue = stateRef.current.lastMouseSpringValue;
        const dt = now - stateRef.current.lastMouseSpringTime;
        const dx = {
          x: c.value.x - lastValue.x,
          y: c.value.y - lastValue.y,
        };
        const speed = {
          x: dx.x / dt,
          y: dx.y / dt,
        };

        if (Math.abs(speed.x) > 1e10 || Math.abs(speed.y) > 1e10) {
          speed.x = 0;
          speed.y = 0;
        }

        stateRef.current.mouseSpringSpeed = speed;

        stateRef.current.lastMouseSpringValue = c.value;
        stateRef.current.lastMouseSpringTime = now;
      },
    }),
    mouseSpringSpeed: {
      x: 0,
      y: 0,
    },
    bgTextureUrl: null,
    bgTexture: null,
    bgTextureRatio: 1,
    bgTextureType: null,
    bgTextureReady: false,
    iconTexture: null,
    iconTextureReady: false,
    iconTextureRatio: 1,
    iconSize: 52,
    iconOpacity: 100,
    iconOffsetX: 0,
    iconOffsetY: 0,
    bgVideoEls: new Map(),
    langName: langName,
    rendererBackend: 'webgl',
    activeRenderer: null,
    gpuDevice: null,
  });
  stateRef.current.canvasInfo = canvasInfo;
  stateRef.current.controls = controls;
  stateRef.current.langName = langName;
  stateRef.current.iconSize = iconSize;
  stateRef.current.iconOpacity = iconOpacity;
  stateRef.current.iconOffsetX = iconOffsetX;
  stateRef.current.iconOffsetY = iconOffsetY;

  useEffect(() => {
    if (interactionMode !== 'center') return;
    const centered = { x: canvasInfo.width / 2, y: canvasInfo.height / 2 };
    shapePositionRef.current = centered;
    setShapePosition(centered);
    const pointer = {
      x: centered.x * canvasInfo.dpr,
      y: (canvasInfo.height - centered.y) * canvasInfo.dpr,
    };
    stateRef.current.canvasPointerPos = pointer;
    stateRef.current.mouseSpring.set(pointer);
  }, [interactionMode, canvasInfo.width, canvasInfo.height, canvasInfo.dpr]);

  useEffect(() => {
    // The studio now starts with a single editable shape instead of the legacy
    // secondary circle merging into the rectangle.
    controlsAPI({ showShape1: false, mergeRate: 0 });
  }, []);

  const handleShapePresetChange = (preset: ShapePreset) => {
    setShapePreset(preset);
    const currentWidth = controls.shapeWidth;
    const currentHeight = controls.shapeHeight;
    const squareSize = Math.min(currentWidth, currentHeight);
    const values = preset === 'circle'
      ? { shapeWidth: squareSize, shapeHeight: squareSize, shapeRadius: 100, shapeRoundness: 2 }
      : preset === 'square'
        ? { shapeWidth: squareSize, shapeHeight: squareSize, shapeRadius: 0, shapeRoundness: 2 }
        : preset === 'squircle'
          ? { shapeWidth: squareSize, shapeHeight: squareSize, shapeRadius: 34, shapeRoundness: 5 }
          : { shapeWidth: currentWidth, shapeHeight: currentHeight, shapeRadius: 28, shapeRoundness: 4 };
    controlsAPI({ ...values, showShape1: false, mergeRate: 0 });
  };

  const handleInteractionModeChange = (mode: InteractionMode) => {
    draggingShapeRef.current = false;
    setInteractionMode(mode);
  };

  const handleIconChange = (src: string | null, name = '') => {
    setIconSrc(src);
    setIconName(name);
    setIconOffsetX(0);
    setIconOffsetY(0);
  };

  const handleExport = async () => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || isExporting) return;
    setIsExporting(true);

    const originalCanvasInfo = { ...canvasInfo };
    const originalPosition = { ...shapePositionRef.current };
    const originalMode = interactionMode;
    const widthScale = (exportSize * 0.82) / Math.max(controls.shapeWidth, controls.shapeHeight);
    const outputShapeWidth = controls.shapeWidth * widthScale;
    const outputShapeHeight = controls.shapeHeight * widthScale;

    try {
      const gl = canvasEl.getContext('webgl2');
      const maxTextureSize = stateRef.current.rendererBackend === 'webgpu'
        ? stateRef.current.gpuDevice?.limits.maxTextureDimension2D
        : gl?.getParameter(gl.MAX_TEXTURE_SIZE);
      if (maxTextureSize && exportSize > maxTextureSize) {
        throw new Error(`A resolução escolhida excede o limite deste dispositivo (${maxTextureSize}px).`);
      }
      stateRef.current.renderScale = widthScale;
      stateRef.current.blurWeights = computeGaussianKernelByRadius(Math.min(200, controls.blurRadius * widthScale));
      // Export always ignores preview backgrounds, regardless of the selected thumbnail.
      stateRef.current.activeRenderer?.setUniform('u_exportTransparent', 1);
      const centered = { x: exportSize / 2, y: exportSize / 2 };
      shapePositionRef.current = centered;
      setShapePosition(centered);
      const pointer = { x: exportSize / 2, y: exportSize / 2 };
      stateRef.current.canvasPointerPos = pointer;
      stateRef.current.mouseSpring.set(pointer);
      setCanvasInfo({ width: exportSize, height: exportSize, dpr: 1 });
      await waitForFrames(4);
      // Wait for GPU work to finish before reading the canvas. This avoids
      // capturing an unfinished/black frame at high resolutions.
      if (stateRef.current.rendererBackend === 'webgpu') {
        await stateRef.current.gpuDevice?.queue.onSubmittedWorkDone();
      } else {
        canvasEl.getContext('webgl2')?.finish();
      }

      const output = document.createElement('canvas');
      output.width = exportSize;
      output.height = exportSize;
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('Não foi possível criar a imagem de exportação.');

      // Copy the original Liquid Glass renderer, then clip it to the exact icon
      // silhouette so the exported PNG has transparent outer corners.
      ctx.drawImage(canvasEl, 0, 0, exportSize, exportSize);


      const mask = document.createElement('canvas');
      mask.width = exportSize;
      mask.height = exportSize;
      const maskCtx = mask.getContext('2d');
      if (!maskCtx) throw new Error('Não foi possível criar a máscara transparente.');
      maskCtx.fillStyle = '#fff';
      maskCtx.beginPath();
      if (shapePreset === 'circle') {
        maskCtx.ellipse(exportSize / 2, exportSize / 2, outputShapeWidth / 2, outputShapeHeight / 2, 0, 0, Math.PI * 2);
      } else {
        const radius = (Math.min(outputShapeWidth, outputShapeHeight) / 2) * (controls.shapeRadius / 100);
        traceSuperellipseShape(maskCtx, exportSize / 2, exportSize / 2, outputShapeWidth, outputShapeHeight, radius, controls.shapeRoundness);
      }
      maskCtx.fill();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) => value ? resolve(value) : reject(new Error('O navegador não conseguiu gerar o PNG.')), 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lgStudio-icon-${exportSize}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error('Falha ao exportar ícone:', error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível exportar o ícone.');
    } finally {
      stateRef.current.renderScale = 1;
      stateRef.current.activeRenderer?.setUniform('u_exportTransparent', 0);
      stateRef.current.blurWeights = computeGaussianKernelByRadius(controls.blurRadius);
      setCanvasInfo(originalCanvasInfo);
      shapePositionRef.current = originalPosition;
      setShapePosition(originalPosition);
      const restorePointer = {
        x: originalPosition.x * originalCanvasInfo.dpr,
        y: (originalCanvasInfo.height - originalPosition.y) * originalCanvasInfo.dpr,
      };
      stateRef.current.canvasPointerPos = restorePointer;
      stateRef.current.mouseSpring.set(restorePointer);
      if (originalMode === 'center') {
        setInteractionMode('center');
      }
      await waitForFrames(2);
      setIsExporting(false);
    }
  };

  // useEffect(() => {
  //   setLangName(controls.language[0] as keyof typeof languages);
  // }, [controls.language]);

  // console.log(controls.language);

  useMemo(() => {
    stateRef.current.blurWeights = computeGaussianKernelByRadius(controls.blurRadius);
  }, [controls.blurRadius]);

  const centerizeCanvasWindow = useCallback(() => {
    const ctrl = stateRef.current.canvasWindowCtrlRef;
    if (!ctrl) {
      return;
    }
    const size = ctrl.getSize();
    const mobile = window.innerWidth <= 760;
    ctrl.setMoveOffset({
      x: window.innerWidth / 2 - size.width / 2,
      // Reserva a metade inferior para os controles e mantém o ícone visível
      // na área de trabalho superior em telas de celular.
      y: (mobile ? window.innerHeight * 0.28 : window.innerHeight * 0.29) - size.height / 2,
    });
  }, []);

  useLayoutEffect(() => {
    const onResize = () => {
      const size = getInitialCanvasSize();
      setCanvasInfo((v) => ({
        width: size,
        height: size,
        dpr: window.devicePixelRatio || 1,
      }));
      setShapePosition((current) => ({
        x: Math.min(current.x, size),
        y: Math.min(current.y, size),
      }));
      requestAnimationFrame(centerizeCanvasWindow);
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    canvasRef.current.width = canvasInfo.width * canvasInfo.dpr;
    canvasRef.current.height = canvasInfo.height * canvasInfo.dpr;
  }, [canvasInfo]);

  // Sync rendererBackend to stateRef
  stateRef.current.rendererBackend = rendererBackend;

  // Helper: create WebGL renderer
  const createWebGLRenderer = useCallback((canvasEl: HTMLCanvasElement) => {
    const gl = canvasEl.getContext('webgl2', { alpha: true, preserveDrawingBuffer: true });
    if (!gl) return null;
    return new MultiPassRenderer(canvasEl, [
      { name: 'bgPass', shader: { vertex: VertexShader, fragment: FragmentBgShader } },
      { name: 'vBlurPass', shader: { vertex: VertexShader, fragment: FragmentBgVblurShader }, inputs: { u_prevPassTexture: 'bgPass' } },
      { name: 'hBlurPass', shader: { vertex: VertexShader, fragment: FragmentBgHblurShader }, inputs: { u_prevPassTexture: 'vBlurPass' } },
      { name: 'mainPass', shader: { vertex: VertexShader, fragment: FragmentMainShader }, inputs: { u_blurredBg: 'hBlurPass', u_bg: 'bgPass' }, outputToScreen: true },
    ]);
  }, []);

  // Helper: create WebGPU renderer
  const createWebGPURenderer = useCallback((canvasEl: HTMLCanvasElement, device: GPUDevice) => {
    return new GPUMultiPassRenderer(canvasEl, [
      { name: 'bgPass', shader: { vertex: WgslVertex, fragment: WgslFragBg } },
      { name: 'vBlurPass', shader: { vertex: WgslVertex, fragment: WgslFragVblur }, inputs: { u_prevPassTexture: 'bgPass' } },
      { name: 'hBlurPass', shader: { vertex: WgslVertex, fragment: WgslFragHblur }, inputs: { u_prevPassTexture: 'vBlurPass' } },
      { name: 'mainPass', shader: { vertex: WgslVertex, fragment: WgslFragMain }, inputs: { u_blurredBg: 'hBlurPass', u_bg: 'bgPass' }, outputToScreen: true },
    ], device);
  }, []);

  // Effect: handle backend switch (and initial creation)
  // Depends on canvasKey so it re-runs after React remounts the <canvas>
  useEffect(() => {
    if (!canvasRef.current) return;

    // Dispose old renderer
    if (stateRef.current.activeRenderer) {
      stateRef.current.activeRenderer.dispose();
      stateRef.current.activeRenderer = null;
    }

    // Clear old texture (it's tied to old context)
    stateRef.current.bgTexture = null;
    stateRef.current.bgTextureReady = false;
    stateRef.current.iconTexture = null;
    stateRef.current.iconTextureReady = false;
    stateRef.current.iconTextureRatio = 1;
    // Force the render loop to re-detect bgTextureUrl change and reload the texture.
    // Save and restore via a microtask so the render loop sees a null→url transition.
    const savedBgTextureUrl = stateRef.current.bgTextureUrl;
    const savedBgTextureType = stateRef.current.bgTextureType;
    stateRef.current.bgTextureUrl = null;
    stateRef.current.bgTextureType = null;

    const canvasEl = canvasRef.current;

    // Pointer modes are explicit: locked center, drag while pressed, or click-to-place.
    const updateShapeFromPointer = (e: PointerEvent) => {
      const ci = stateRef.current.canvasInfo;
      const rect = canvasEl.getBoundingClientRect();
      if (!ci || rect.width <= 0 || rect.height <= 0) return;
      const logicalPosition = {
        x: Math.max(0, Math.min(ci.width, ((e.clientX - rect.left) / rect.width) * ci.width)),
        y: Math.max(0, Math.min(ci.height, ((e.clientY - rect.top) / rect.height) * ci.height)),
      };
      shapePositionRef.current = logicalPosition;
      setShapePosition(logicalPosition);
      stateRef.current.canvasPointerPos = {
        x: logicalPosition.x * ci.dpr,
        y: (ci.height - logicalPosition.y) * ci.dpr,
      };
      stateRef.current.mouseSpring.start(stateRef.current.canvasPointerPos);
    };
    const onPointerDown = (e: PointerEvent) => {
      const mode = interactionModeRef.current;
      if (mode === 'center') return;
      if (mode === 'drag') {
        draggingShapeRef.current = true;
        try { canvasEl.setPointerCapture(e.pointerId); } catch { /* pointer capture may be unavailable */ }
      }
      if (mode === 'drag' || mode === 'click') updateShapeFromPointer(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (interactionModeRef.current === 'drag' && draggingShapeRef.current) updateShapeFromPointer(e);
    };
    const onPointerUp = () => { draggingShapeRef.current = false; };
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerUp);

    if (rendererBackend === 'webgpu' && webgpuDetect?.supported && webgpuDetect.device) {
      stateRef.current.gpuDevice = webgpuDetect.device;
      try {
        const renderer = createWebGPURenderer(canvasEl, webgpuDetect.device);
        stateRef.current.activeRenderer = renderer;
      } catch (e) {
        console.error('Failed to create WebGPU renderer, falling back to WebGL:', e);
        const renderer = createWebGLRenderer(canvasEl);
        stateRef.current.activeRenderer = renderer;
      }
    } else {
      stateRef.current.gpuDevice = null;
      const renderer = createWebGLRenderer(canvasEl);
      stateRef.current.activeRenderer = renderer;
    }

    // The new canvas (from key change) starts at default 300x150.
    // Apply current canvasInfo dimensions and force a renderer resize.
    const ci = stateRef.current.canvasInfo;
    canvasEl.width = ci.width * ci.dpr;
    canvasEl.height = ci.height * ci.dpr;
    if (stateRef.current.activeRenderer) {
      const w = ci.width * ci.dpr;
      const h = ci.height * ci.dpr;
      if (stateRef.current.rendererBackend === 'webgl') {
        const gl = canvasEl.getContext('webgl2');
        gl?.viewport(0, 0, Math.round(w), Math.round(h));
      }
      stateRef.current.activeRenderer.resize(w, h);
      stateRef.current.activeRenderer.setUniform('u_resolution', [w, h]);
    }

    // Restore the background texture URL so the render loop detects the
    // null→url transition on the next frame and reloads the texture.
    requestAnimationFrame(() => {
      stateRef.current.bgTextureUrl = savedBgTextureUrl;
      stateRef.current.bgTextureType = savedBgTextureType;
    });

    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('pointercancel', onPointerUp);
    };
  }, [rendererBackend, canvasKey, webgpuDetect, createWebGLRenderer, createWebGPURenderer]);

  // Upload the imported artwork as a real GPU texture. The background pass
  // composites it before blur/refraction, so it becomes part of the glass scene
  // instead of a flat HTML layer on top of the canvas.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    let cancelled = false;
    const previousTexture = stateRef.current.iconTexture;
    if (previousTexture) {
      if (rendererBackend === 'webgl') {
        canvasEl.getContext('webgl2')?.deleteTexture(previousTexture as WebGLTexture);
      } else {
        (previousTexture as GPUTexture).destroy();
      }
    }
    stateRef.current.iconTexture = null;
    stateRef.current.iconTextureReady = false;
    stateRef.current.iconTextureRatio = 1;

    if (!iconSrc) return;

    const uploadIcon = async () => {
      try {
        if (rendererBackend === 'webgl') {
          const gl = canvasEl.getContext('webgl2');
          if (!gl) return;
          const result = await loadTextureFromURL(gl, iconSrc);
          if (cancelled) {
            gl.deleteTexture(result.texture);
            return;
          }
          stateRef.current.iconTexture = result.texture;
          stateRef.current.iconTextureRatio = result.ratio;
          stateRef.current.iconTextureReady = true;
        } else {
          const device = stateRef.current.gpuDevice ?? webgpuDetect?.device;
          if (!device) return;
          const result = await gpuLoadTextureFromURL(device, iconSrc);
          if (cancelled) {
            result.texture.destroy();
            return;
          }
          stateRef.current.iconTexture = result.texture;
          stateRef.current.iconTextureRatio = result.ratio;
          stateRef.current.iconTextureReady = true;
        }
      } catch (error) {
        console.error('Não foi possível carregar a imagem para o shader Liquid Glass:', error);
        if (!cancelled) {
          stateRef.current.iconTextureReady = false;
          window.alert('Não foi possível carregar essa imagem para o efeito Liquid Glass. Tente PNG, JPG, WEBP ou SVG.');
        }
      }
    };

    void uploadIcon();
    return () => {
      cancelled = true;
    };
  }, [iconSrc, rendererBackend, canvasKey, webgpuDetect]);

  useEffect(() => {
    let raf: number | null = null;
    const lastState = {
      canvasInfo: null as typeof canvasInfo | null,
      controls: null as typeof controls | null,
      bgTextureType: null as typeof stateRef.current.bgTextureType,
      bgTextureUrl: null as typeof stateRef.current.bgTextureUrl,
    };
    const render = () => {
      raf = requestAnimationFrame(render);

      const renderer = stateRef.current.activeRenderer;
      if (!renderer) return;

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;

      const backend = stateRef.current.rendererBackend;
      const canvasInfo = stateRef.current.canvasInfo;
      const textureUrl = stateRef.current.bgTextureUrl;

      if (
        !lastState.canvasInfo ||
        lastState.canvasInfo.width !== canvasInfo.width ||
        lastState.canvasInfo.height !== canvasInfo.height ||
        lastState.canvasInfo.dpr !== canvasInfo.dpr
      ) {
        if (backend === 'webgl') {
          const gl = canvasEl.getContext('webgl2');
          if (gl) {
            gl.viewport(0, 0, Math.round(canvasInfo.width * canvasInfo.dpr), Math.round(canvasInfo.height * canvasInfo.dpr));
          }
        }
        renderer.resize(canvasInfo.width * canvasInfo.dpr, canvasInfo.height * canvasInfo.dpr);
        renderer.setUniform('u_resolution', [canvasInfo.width * canvasInfo.dpr, canvasInfo.height * canvasInfo.dpr]);
      }

      // Texture management
      if (textureUrl !== lastState.bgTextureUrl) {
        if (lastState.bgTextureType === 'video') {
          if (lastState.controls?.bgType !== undefined) {
            stateRef.current.bgVideoEls.get(lastState.controls.bgType)?.pause();
          }
        }
        if (!textureUrl) {
          if (stateRef.current.bgTexture) {
            if (backend === 'webgl') {
              const gl = canvasEl.getContext('webgl2');
              gl?.deleteTexture(stateRef.current.bgTexture as WebGLTexture);
            } else {
              (stateRef.current.bgTexture as GPUTexture)?.destroy();
            }
            stateRef.current.bgTexture = null;
            stateRef.current.bgTextureType = null;
          }
        } else {
          if (stateRef.current.bgTextureType === 'image') {
            const rafId = requestAnimationFrame(() => { stateRef.current.bgTextureReady = false; });
            if (backend === 'webgl') {
              const gl = canvasEl.getContext('webgl2');
              if (gl) {
                loadTextureFromURL(gl, textureUrl).then(({ texture, ratio }) => {
                  if (stateRef.current.bgTextureUrl === textureUrl) {
                    cancelAnimationFrame(rafId);
                    stateRef.current.bgTexture = texture;
                    stateRef.current.bgTextureRatio = ratio;
                    stateRef.current.bgTextureReady = true;
                  }
                });
              }
            } else if (stateRef.current.gpuDevice) {
              gpuLoadTextureFromURL(stateRef.current.gpuDevice, textureUrl).then(({ texture, ratio }) => {
                if (stateRef.current.bgTextureUrl === textureUrl) {
                  cancelAnimationFrame(rafId);
                  stateRef.current.bgTexture = texture;
                  stateRef.current.bgTextureRatio = ratio;
                  stateRef.current.bgTextureReady = true;
                }
              });
            }
          } else if (stateRef.current.bgTextureType === 'video') {
            stateRef.current.bgTextureReady = false;
            if (backend === 'webgl') {
              const gl = canvasEl.getContext('webgl2');
              if (gl) {
                stateRef.current.bgTexture = createEmptyTexture(gl);
              }
            } else if (stateRef.current.gpuDevice) {
              stateRef.current.bgTexture = gpuCreateEmptyTexture(stateRef.current.gpuDevice);
            }
            stateRef.current.bgVideoEls.get(stateRef.current.controls.bgType)?.play();
          }
        }
      }
      lastState.controls = stateRef.current.controls;
      lastState.bgTextureType = stateRef.current.bgTextureType;
      lastState.canvasInfo = canvasInfo;
      lastState.bgTextureUrl = stateRef.current.bgTextureUrl;

      // Video texture update
      if (stateRef.current.bgTextureType === 'video') {
        const videoEl = stateRef.current.bgVideoEls.get(stateRef.current.controls.bgType);
        if (stateRef.current.bgTexture && videoEl) {
          if (backend === 'webgl') {
            const gl = canvasEl.getContext('webgl2');
            if (gl) {
              const info = updateVideoTexture(gl, stateRef.current.bgTexture as WebGLTexture, videoEl);
              if (info) {
                stateRef.current.bgTextureRatio = info.ratio;
                stateRef.current.bgTextureReady = true;
              }
            }
          } else if (stateRef.current.gpuDevice) {
            gpuUpdateVideoTexture(stateRef.current.gpuDevice, stateRef.current.bgTexture as GPUTexture, videoEl).then((info) => {
              if (info) {
                stateRef.current.bgTexture = info.texture;
                stateRef.current.bgTextureRatio = info.ratio;
                stateRef.current.bgTextureReady = true;
              }
            });
          }
        }
      }

      if (backend === 'webgl') {
        const gl = canvasEl.getContext('webgl2');
        if (gl) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
      }

      const controls = stateRef.current.controls;
      const mouseSpring = stateRef.current.mouseSpring.get();
      const renderScale = stateRef.current.renderScale;

      const shapeSizeSpring = {
        x:
          controls.shapeWidth +
          (Math.abs(stateRef.current.mouseSpringSpeed.x) *
            controls.shapeWidth *
            controls.springSizeFactor) /
          100,
        y:
          controls.shapeHeight +
          (Math.abs(stateRef.current.mouseSpringSpeed.y) *
            controls.shapeHeight *
            controls.springSizeFactor) /
          100,
      };

      renderer.setUniforms({
        u_resolution: [canvasInfo.width * canvasInfo.dpr, canvasInfo.height * canvasInfo.dpr],
        u_dpr: canvasInfo.dpr,
        u_blurWeights: stateRef.current.blurWeights,
        u_blurRadius: Math.min(200, stateRef.current.controls.blurRadius * renderScale),
        u_mouse: [stateRef.current.canvasPointerPos.x, stateRef.current.canvasPointerPos.y],
        u_mouseSpring: [mouseSpring.x, mouseSpring.y],
        u_shapeWidth: shapeSizeSpring.x * renderScale,
        u_shapeHeight: shapeSizeSpring.y * renderScale,
        u_shapeRadius:
          ((Math.min(shapeSizeSpring.x, shapeSizeSpring.y) / 2) * controls.shapeRadius * renderScale) / 100,
        u_shapeRoundness: controls.shapeRoundness,
        u_mergeRate: controls.mergeRate,
        u_glareAngle: (controls.glareAngle * Math.PI) / 180,
        u_showShape1: controls.showShape1 ? 1 : 0,
      });

      renderer.render({
        bgPass: {
          u_bgType: controls.bgType,
          u_bgTexture: (stateRef.current.bgTextureUrl && stateRef.current.bgTexture) ?? undefined,
          u_bgTextureRatio:
            stateRef.current.bgTextureUrl && stateRef.current.bgTexture
              ? stateRef.current.bgTextureRatio
              : undefined,
          u_bgTextureReady: stateRef.current.bgTextureReady ? 1 : 0,
          u_iconTexture: stateRef.current.iconTextureReady ? stateRef.current.iconTexture ?? undefined : undefined,
          u_iconReady: stateRef.current.iconTextureReady ? 1 : 0,
          u_iconOpacity: stateRef.current.iconOpacity / 100,
          u_iconRect: (() => {
            if (!stateRef.current.iconTextureReady) return [0, 0, 0, 0];
            const dpr = canvasInfo.dpr;
            const canvasPixelWidth = canvasInfo.width * dpr;
            const canvasPixelHeight = canvasInfo.height * dpr;
            const logicalSize = Math.min(shapeSizeSpring.x, shapeSizeSpring.y) * renderScale * (stateRef.current.iconSize / 100);
            const ratio = Math.max(0.0001, stateRef.current.iconTextureRatio || 1);
            const logicalWidth = ratio >= 1 ? logicalSize : logicalSize * ratio;
            const logicalHeight = ratio >= 1 ? logicalSize / ratio : logicalSize;
            // Use the animated glass center (same spring coordinates as the SDF),
            // so the artwork remains attached while the glass is moved.
            const centerX = mouseSpring.x + (stateRef.current.iconOffsetX / 100) * shapeSizeSpring.x * renderScale * dpr;
            const centerYBottom = mouseSpring.y - (stateRef.current.iconOffsetY / 100) * shapeSizeSpring.y * renderScale * dpr;
            const widthPx = logicalWidth * dpr;
            const heightPx = logicalHeight * dpr;
            const left = (centerX - widthPx / 2) / Math.max(1, canvasPixelWidth);
            const bottom = (centerYBottom - heightPx / 2) / Math.max(1, canvasPixelHeight);
            const top = 1 - (centerYBottom + heightPx / 2) / Math.max(1, canvasPixelHeight);
            const y = backend === 'webgpu' ? top : bottom;
            return [left, y, widthPx / Math.max(1, canvasPixelWidth), heightPx / Math.max(1, canvasPixelHeight)];
          })(),
          u_shadowExpand: controls.shadowExpand * renderScale,
          u_shadowFactor: controls.shadowFactor / 100,
          u_shadowPosition: [-controls.shadowPosition.x * renderScale, -controls.shadowPosition.y * renderScale],
        },
        mainPass: {
          u_tint: [
            controls.tint.r / 255,
            controls.tint.g / 255,
            controls.tint.b / 255,
            controls.tint.a,
          ],
          u_refThickness: controls.refThickness * renderScale,
          u_refDistance: controls.refDistance,
          u_refFactor: controls.refFactor,
          u_refDispersion: controls.refDispersion,
          u_refFresnelRange: controls.refFresnelRange * renderScale,
          u_refFresnelHardness: controls.refFresnelHardness / 100,
          u_refFresnelFactor: controls.refFresnelFactor / 100,
          u_glareRange: controls.glareRange * renderScale,
          u_glareHardness: controls.glareHardness / 100,
          u_glareConvergence: controls.glareConvergence / 100,
          u_glareOppositeFactor: controls.glareOppositeFactor / 100,
          u_glareFactor: controls.glareFactor / 100,
          u_blurEdge: controls.blurEdge ? 1 : 0,
          STEP: controls.step,
        },
      });
    };
    raf = requestAnimationFrame(render);

    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, []);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logoWrapper}>
          <div className={styles.title}>lgStudio</div>
          <div className={styles.subtitle}>{lang['ui.subtitle']}</div>
        </div>
        <div className={styles.content}>
          <span>
            por <a>iyinchao</a>
          </span>
          <a
            href="https://github.com/iyinchao/liquid-glass-studio"
            target="_blank"
            className={styles.button}
          >
            <GitHubIcon />
          </a>
          <a
            href="https://x.com/charles_yin/status/1936338569267986605"
            target="_blank"
            className={styles.button}
          >
            <XIcon></XIcon>
          </a>
        </div>
      </header>
      <div className={styles.settingsDock}>
      <EditorPanel
        controls={controls}
        controlsAPI={controlsAPI}
        shapePreset={shapePreset}
        onShapePresetChange={handleShapePresetChange}
        interactionMode={interactionMode}
        onInteractionModeChange={handleInteractionModeChange}
        iconSrc={iconSrc}
        onIconChange={handleIconChange}
        iconName={iconName}
        iconSize={iconSize}
        onIconSizeChange={setIconSize}
        iconOpacity={iconOpacity}
        onIconOpacityChange={setIconOpacity}
        iconOffsetX={iconOffsetX}
        onIconOffsetXChange={setIconOffsetX}
        iconOffsetY={iconOffsetY}
        onIconOffsetYChange={setIconOffsetY}
        exportSize={exportSize}
        onExportSizeChange={setExportSize}
        onExport={handleExport}
        isExporting={isExporting}
      />
      {levaGlobal}
      <PresetControls
        controls={controls}
        controlsAPI={controlsAPI}
        lang={lang}
      />
      </div>
      <ResizableWindow
        disableMove
        className={isExporting ? styles.exportingWindow : undefined}
        size={canvasInfo}
        onResize={(size) => {
          setCanvasInfo({
            ...size,
            dpr: window.devicePixelRatio,
          });
          centerizeCanvasWindow();
        }}
        onMove={(pos) => {
          stateRef.current.canvasPos = pos;
        }}
        ctrlRef={(ref) => {
          stateRef.current.canvasWindowCtrlRef = ref;
        }}
      >
        <div className={clsx(styles.canvasContainer)}>
          <canvas
            key={canvasKey}
            ref={canvasRef}
            className={styles.canvas}
            style={
              {
                ['--dpr']: canvasInfo.dpr,
              } as CSSProperties
            }
          />
        </div>
      </ResizableWindow>
    </>
  );
}

export default App;
