import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import styles from './EditorPanel.module.scss';
import type { useLevaControls } from './Controls';

export type ShapePreset = 'circle' | 'square' | 'squircle' | 'rounded';
export type InteractionMode = 'center' | 'drag' | 'click';

type Props = {
  controls: ReturnType<typeof useLevaControls>['controls'];
  controlsAPI: ReturnType<typeof useLevaControls>['controlsAPI'];
  shapePreset: ShapePreset;
  onShapePresetChange: (preset: ShapePreset) => void;
  interactionMode: InteractionMode;
  onInteractionModeChange: (mode: InteractionMode) => void;
  iconSrc: string | null;
  onIconChange: (src: string | null, name?: string) => void;
  iconName: string;
  iconSize: number;
  onIconSizeChange: (value: number) => void;
  iconOpacity: number;
  onIconOpacityChange: (value: number) => void;
  iconOffsetX: number;
  onIconOffsetXChange: (value: number) => void;
  iconOffsetY: number;
  onIconOffsetYChange: (value: number) => void;
  exportSize: number;
  onExportSizeChange: (value: number) => void;
  onExport: () => void;
  isExporting: boolean;
};

const toHex = (value: { r: number; g: number; b: number }) =>
  `#${[value.r, value.g, value.b].map((part) => Math.round(part).toString(16).padStart(2, '0')).join('')}`;

const fromHex = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

export function EditorPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragStartRef = useRef<{ pointerY: number; offsetY: number } | null>(null);
  const [panelOffsetY, setPanelOffsetY] = useState(0);

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerY: event.clientY, offsetY: panelOffsetY };
  };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !panelRef.current) return;
    const panelHeight = panelRef.current.getBoundingClientRect().height;
    const minOffset = -Math.min(window.innerHeight * 0.08, 72);
    // Deslize para baixo para recolher parcialmente a gaveta e liberar a prévia.
    const maxOffset = Math.min(window.innerHeight * 0.30, Math.max(0, panelHeight - 76));
    const nextOffset = dragStartRef.current.offsetY + event.clientY - dragStartRef.current.pointerY;
    setPanelOffsetY(Math.max(minOffset, Math.min(maxOffset, nextOffset)));
  };

  const handleDragEnd = () => {
    dragStartRef.current = null;
  };
  const {
    controls,
    controlsAPI,
    shapePreset,
    onShapePresetChange,
    interactionMode,
    onInteractionModeChange,
    iconSrc,
    onIconChange,
    iconName,
    iconSize,
    onIconSizeChange,
    iconOpacity,
    onIconOpacityChange,
    iconOffsetX,
    onIconOffsetXChange,
    iconOffsetY,
    onIconOffsetYChange,
    exportSize,
    onExportSizeChange,
    onExport,
    isExporting,
  } = props;

  const setControl = (values: Parameters<Props['controlsAPI']>[0]) => controlsAPI(values);

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-not-move-handle="true"
      style={{ '--panel-drag-y': `${panelOffsetY}px` } as CSSProperties}
    >
      <div
        className={styles.dragHandle}
        role="button"
        tabIndex={0}
        aria-label="Arrastar painel de edição para cima ou para baixo"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onLostPointerCapture={handleDragEnd}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') setPanelOffsetY((value) => Math.max(-Math.min(window.innerHeight * 0.08, 72), value - 40));
          if (event.key === 'ArrowDown') setPanelOffsetY((value) => Math.min(Math.min(window.innerHeight * 0.30, Math.max(0, (panelRef.current?.getBoundingClientRect().height ?? 0) - 76)), value + 40));
        }}
      >
        <span />
      </div>
      <div className={styles.panelHeader}>
        <div>
          <strong>lgStudio</strong>
          <span>Editor de ícones Liquid Glass</span>
        </div>
        <span className={styles.liveDot}>LIVE</span>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>FORMA</div>
        <div className={styles.buttonGrid}>
          {([
            ['circle', 'Círculo', '●'],
            ['square', 'Quadrado', '■'],
            ['squircle', 'Squircle', '▣'],
            ['rounded', 'Retângulo', '▰'],
          ] as [ShapePreset, string, string][]).map(([value, label, glyph]) => (
            <button
              key={value}
              type="button"
              className={`${styles.choiceButton} ${shapePreset === value ? styles.active : ''}`}
              onClick={() => onShapePresetChange(value)}
            >
              <span className={styles.shapeGlyph}>{glyph}</span>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Largura <b>{Math.round(controls.shapeWidth)} px</b></span>
            <input type="range" min="40" max="800" step="1" value={controls.shapeWidth} onChange={(e) => {
              const value = Number(e.target.value);
              setControl(shapePreset === 'circle' || shapePreset === 'square' || shapePreset === 'squircle'
                ? { shapeWidth: value, shapeHeight: value }
                : { shapeWidth: value });
            }} />
          </label>
          <label className={styles.field}>
            <span>Altura <b>{Math.round(controls.shapeHeight)} px</b></span>
            <input type="range" min="40" max="800" step="1" value={controls.shapeHeight} onChange={(e) => {
              const value = Number(e.target.value);
              setControl(shapePreset === 'circle' || shapePreset === 'square' || shapePreset === 'squircle'
                ? { shapeWidth: value, shapeHeight: value }
                : { shapeHeight: value });
            }} />
          </label>
        </div>
        <label className={styles.field}>
          <span>Arredondamento <b>{Math.round(controls.shapeRadius)}%</b></span>
          <input type="range" min="1" max="100" step="1" value={controls.shapeRadius} onChange={(e) => setControl({ shapeRadius: Number(e.target.value) })} />
        </label>
        <label className={styles.field}>
          <span>Curvatura da borda <b>{Number(controls.shapeRoundness).toFixed(1)}</b></span>
          <input type="range" min="2" max="7" step="0.1" value={controls.shapeRoundness} onChange={(e) => setControl({ shapeRoundness: Number(e.target.value) })} />
        </label>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>POSICIONAMENTO DA FORMA</div>
        <div className={styles.modeGrid}>
          <button type="button" className={`${styles.modeButton} ${interactionMode === 'center' ? styles.active : ''}`} onClick={() => onInteractionModeChange('center')}>Centro fixo</button>
          <button type="button" className={`${styles.modeButton} ${interactionMode === 'drag' ? styles.active : ''}`} onClick={() => onInteractionModeChange('drag')}>Arrastar</button>
          <button type="button" className={`${styles.modeButton} ${interactionMode === 'click' ? styles.active : ''}`} onClick={() => onInteractionModeChange('click')}>Clique para mover</button>
        </div>
        <p className={styles.hint}>
          {interactionMode === 'center' ? 'A forma fica centralizada e não acompanha o cursor.' : interactionMode === 'drag' ? 'Clique e segure sobre a área de edição para arrastar a forma.' : 'Clique em qualquer ponto da área de edição para posicionar a forma.'}
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>ÍCONE INTERNO</div>
        <input
          ref={fileRef}
          className={styles.hiddenInput}
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onIconChange(typeof reader.result === 'string' ? reader.result : null, file.name);
            reader.onerror = () => window.alert('Não foi possível abrir essa imagem.');
            reader.readAsDataURL(file);
            event.target.value = '';
          }}
        />
        <button type="button" className={styles.uploadButton} onClick={() => fileRef.current?.click()}>
          <span className={styles.uploadIcon}>＋</span>
          {iconSrc ? 'Trocar imagem do ícone' : 'Adicionar imagem do ícone'}
        </button>
        <div className={styles.fileRow}>
          <span title={iconName}>{iconSrc ? iconName : 'Nenhuma imagem selecionada'}</span>
          {iconSrc && <button type="button" className={styles.removeButton} onClick={() => onIconChange(null, '')}>Remover</button>}
        </div>
        <p className={styles.hint}>A imagem agora entra na cena do renderizador antes da refração. O vidro pode dobrar, dispersar e desfocar a própria imagem, em vez de apenas exibi-la por cima.</p>
        <label className={styles.field}>
          <span>Tamanho do ícone <b>{iconSize}%</b></span>
          <input type="range" min="10" max="95" step="1" value={iconSize} onChange={(e) => onIconSizeChange(Number(e.target.value))} disabled={!iconSrc} />
        </label>
        <label className={styles.field}>
          <span>Opacidade do ícone <b>{iconOpacity}%</b></span>
          <input type="range" min="10" max="100" step="1" value={iconOpacity} onChange={(e) => onIconOpacityChange(Number(e.target.value))} disabled={!iconSrc} />
        </label>
        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>Deslocamento X <b>{iconOffsetX}</b></span>
            <input type="range" min="-50" max="50" step="1" value={iconOffsetX} onChange={(e) => onIconOffsetXChange(Number(e.target.value))} disabled={!iconSrc} />
          </label>
          <label className={styles.field}>
            <span>Deslocamento Y <b>{iconOffsetY}</b></span>
            <input type="range" min="-50" max="50" step="1" value={iconOffsetY} onChange={(e) => onIconOffsetYChange(Number(e.target.value))} disabled={!iconSrc} />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>COR DO VIDRO</div>
        <div className={styles.colorRow}>
          <input
            aria-label="Cor do vidro"
            type="color"
            value={toHex(controls.tint)}
            onChange={(e) => setControl({ tint: { ...controls.tint, ...fromHex(e.target.value) } })}
          />
          <span>{toHex(controls.tint).toUpperCase()}</span>
        </div>
        <label className={styles.field}>
          <span>Intensidade da cor <b>{Math.round(controls.tint.a * 100)}%</b></span>
          <input type="range" min="0" max="1" step="0.01" value={controls.tint.a} onChange={(e) => setControl({ tint: { ...controls.tint, a: Number(e.target.value) } })} />
        </label>
        <p className={styles.hint}>Os controles completos de refração, dispersão, Fresnel, brilho, desfoque e sombra continuam no painel original à direita.</p>
      </section>

      <section className={styles.exportSection}>
        <div className={styles.sectionTitle}>EXPORTAR ÍCONE</div>
        <label className={styles.field}>
          <span>Resolução PNG</span>
          <select value={exportSize} onChange={(e) => onExportSizeChange(Number(e.target.value))}>
            <option value={1024}>1K — 1024 × 1024</option>
            <option value={2048}>2K — 2048 × 2048</option>
            <option value={4096}>4K — 4096 × 4096 (máxima)</option>
          </select>
        </label>
        <button type="button" className={styles.exportButton} onClick={onExport} disabled={isExporting}>
          {isExporting ? 'Preparando PNG…' : `Exportar PNG ${exportSize === 4096 ? '4K' : `${exportSize / 1024}K`}`}
        </button>
        <p className={styles.hint}>Exporta somente a área da forma, com transparência fora da borda e a imagem interna aplicada.</p>
      </section>
    </aside>
  );
}
