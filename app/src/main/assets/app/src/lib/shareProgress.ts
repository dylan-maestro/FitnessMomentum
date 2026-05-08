import type { Settings, Workout } from './types';
import { ALL_WORKOUT_TEMPLATES } from './templates';
import { fromMetricDistance, fromMetricWeight } from './units';
import AppIconSvg from '../../icon-source/app-icon.svg?raw';

type ShareArtworkWorkout = Pick<
  Workout,
  | 'name'
  | 'momentum'
  | 'dailyVolume'
  | 'workoutType'
  | 'distanceInputMode'
  | 'momentumHistory'
  | 'lastLoggedAt'
>;

type ShareBundleOptions = {
  workouts: ShareArtworkWorkout[];
  settings: Settings;
  shareDate: string;
};

type ShareWorkoutOptions = {
  workout: ShareArtworkWorkout;
  settings: Settings;
  shareDate: string;
};

const SHARE_WIDTH = 1080;
const SHARE_HEIGHT = 1080;
const XMLNS = 'http://www.w3.org/2000/svg';
const fallbackIcon = (AppIconSvg ?? '').trim();
const templateIconMap = new Map(
  ALL_WORKOUT_TEMPLATES.map((template) => [template.name.trim(), (template.icon ?? '').trim()])
);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits
  });
}

function getWorkoutIconMarkup(name?: string | null): string {
  if (!name) {
    return fallbackIcon;
  }

  const iconMarkup = templateIconMap.get(name.trim());
  return iconMarkup && iconMarkup.length > 0 ? iconMarkup : fallbackIcon;
}

function getSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getIconImageMarkup(name: string, x: number, y: number, size: number, radius: number): string {
  const iconMarkup = getWorkoutIconMarkup(name);
  return `
    <g>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="#f5f7fa" stroke="rgba(36, 62, 81, 0.12)" stroke-width="2"/>
      <image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXml(getSvgDataUri(iconMarkup))}" preserveAspectRatio="xMidYMid slice"/>
    </g>`;
}

function getMomentum(workout: ShareArtworkWorkout): number {
  const value = Number(workout.momentum);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getWorkoutTypeLabel(workout: ShareArtworkWorkout): string {
  const workoutType = workout.workoutType ?? 'weight';

  if (workoutType === 'distance') {
    return workout.distanceInputMode === 'laps' ? 'Laps' : 'Distance';
  }
  if (workoutType === 'time') {
    return 'Time';
  }
  return 'Reps';
}

function getLoggedVolumeForDate(workout: ShareArtworkWorkout, shareDate: string): number {
  if (!workout.lastLoggedAt) {
    return 0;
  }

  const loggedDate = workout.lastLoggedAt.slice(0, 10);
  if (loggedDate !== shareDate) {
    return 0;
  }

  const dailyVolume = Number(workout.dailyVolume);
  return Number.isFinite(dailyVolume) && dailyVolume > 0 ? dailyVolume : 0;
}

function formatDailyVolume(workout: ShareArtworkWorkout, settings: Settings, shareDate: string): string {
  const workoutType = workout.workoutType ?? 'weight';
  const dailyVolume = getLoggedVolumeForDate(workout, shareDate);

  if (workoutType === 'distance') {
    const unit = settings.distanceUnit ?? 'km';
    return `${formatNumber(fromMetricDistance(dailyVolume, unit), 2)} ${unit}`;
  }

  if (workoutType === 'time') {
    return `${formatNumber(dailyVolume / 60, 1)} min`;
  }

  const unit = settings.weightUnit ?? 'kg';
  return `${formatNumber(fromMetricWeight(dailyVolume, unit), 0)} ${unit}`;
}

function formatLastActive(workout: ShareArtworkWorkout): string {
  if (!workout.lastLoggedAt) {
    return 'Not logged yet';
  }

  return new Date(workout.lastLoggedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function formatShareDate(shareDate: string): string {
  return new Date(`${shareDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getFooterMarkup(y: number): string {
  return `
    <text x="96" y="${y}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#90a4ae">
      Find your own momentum on
      <tspan font-weight="900" fill="#43a047">fitmo.co</tspan>
    </text>`;
}

type SparklinePoint = {
  x: number;
  y: number;
};

function getSparklinePoints(
  workout: ShareArtworkWorkout,
  width: number,
  height: number,
  padding = 0
): SparklinePoint[] {
  const values = (workout.momentumHistory ?? [])
    .slice(-18)
    .map((entry) => Number(entry.momentum))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const drawWidth = Math.max(1, width - padding * 2);
  const drawHeight = Math.max(1, height - padding * 2);

  return values.map((value, index) => {
      const x = padding + (index / (values.length - 1)) * drawWidth;
      const y = padding + drawHeight - ((value - min) / range) * drawHeight;
      return { x, y };
    });
}

function buildSparklineCurve(points: SparklinePoint[]): string {
  if (points.length < 2) {
    return '';
  }

  const segments: string[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    if (index === 0) {
      segments.push(`Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`);
    } else {
      segments.push(`T ${midX.toFixed(1)} ${midY.toFixed(1)}`);
    }

    if (index === points.length - 2) {
      segments.push(`T ${next.x.toFixed(1)} ${next.y.toFixed(1)}`);
    }
  }

  return segments.join(' ');
}

function buildSparklinePath(points: SparklinePoint[]): string {
  if (!points.length) {
    return '';
  }

  const curve = buildSparklineCurve(points);
  return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} ${curve}`;
}

function buildSparklineAreaPath(points: SparklinePoint[], baseY: number): string {
  if (!points.length) {
    return '';
  }

  const first = points[0];
  const last = points[points.length - 1];
  const curve = buildSparklineCurve(points);
  return `M ${first.x.toFixed(1)} ${baseY.toFixed(1)} L ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${curve} L ${last.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function getEndpointMarkup(
  points: SparklinePoint[],
  momentum: number,
  options: {
    fontSize: number;
    radius: number;
    labelPaddingX: number;
    labelPaddingY: number;
    labelOffsetY: number;
  }
): string {
  const last = points[points.length - 1];
  if (!last) {
    return '';
  }

  const label = String(Math.round(momentum));
  const labelWidth = Math.max(32, label.length * options.fontSize * 0.62 + options.labelPaddingX * 2);
  const labelHeight = options.fontSize + options.labelPaddingY * 2;
  const labelX = Math.max(4, last.x - labelWidth - options.radius - 4);
  const labelY = Math.max(4, last.y - labelHeight / 2 + options.labelOffsetY);

  return `
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="${options.radius}" fill="#ffffff" stroke="#43a047" stroke-width="${Math.max(2, options.radius * 0.45)}"/>
    <rect x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" width="${labelWidth.toFixed(1)}" height="${labelHeight.toFixed(1)}" rx="${(labelHeight / 2).toFixed(1)}" fill="#ffffff" stroke="#dcedc8" stroke-width="1.5"/>
    <text x="${(labelX + labelWidth / 2).toFixed(1)}" y="${(labelY + labelHeight - options.labelPaddingY - 1).toFixed(1)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${options.fontSize}" font-weight="900" fill="#2e7d32">${label}</text>`;
}

function getMiniSparklineMarkup(workout: ShareArtworkWorkout, gradientId: string, maskId: string): string {
  const sparklinePoints = getSparklinePoints(workout, 104, 48, 8);
  const sparklinePath = buildSparklinePath(sparklinePoints);
  const sparklineAreaPath = buildSparklineAreaPath(sparklinePoints, 40);
  const endpointMarkup = getEndpointMarkup(sparklinePoints, getMomentum(workout), {
    fontSize: 13,
    radius: 4.5,
    labelPaddingX: 5,
    labelPaddingY: 3,
    labelOffsetY: -11
  });

  return `
    <svg x="732" y="-3" width="104" height="48" viewBox="0 0 104 48">
      <rect width="104" height="48" rx="12" fill="#f5f7fa" stroke="#e0e7ec" stroke-width="2"/>
      ${
        sparklinePath
          ? `<g mask="url(#${maskId})">
               ${sparklineAreaPath ? `<path d="${sparklineAreaPath}" fill="url(#${gradientId})"/>` : ''}
               <path d="${sparklinePath}" fill="none" stroke="#43a047" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
             </g>
             ${endpointMarkup}`
          : `<circle cx="52" cy="24" r="5" fill="#cfd8dc"/>`
      }
    </svg>`;
}

function getBundleSvg({ workouts, settings, shareDate }: ShareBundleOptions): string {
  const safeWorkouts = workouts.slice(0, 8);
  const shareDateLabel = formatShareDate(shareDate);
  const rows = safeWorkouts
    .map((workout, index) => {
      const y = 352 + index * 72;
      const momentum = Math.round(getMomentum(workout));
      const gradientId = `bundle-sparkline-gradient-${index}`;
      const maskId = `bundle-sparkline-fade-${index}`;
      return `
        <g transform="translate(96 ${y})">
          ${getIconImageMarkup(workout.name, 0, -6, 56, 14)}
          <text x="72" y="18" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800" fill="#243e51">${escapeXml(workout.name)}</text>
          <text x="72" y="52" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="700" fill="#607d8b">${momentum} momentum score · ${escapeXml(formatDailyVolume(workout, settings, shareDate))} today</text>
          ${getMiniSparklineMarkup(workout, gradientId, maskId)}
        </g>`;
    })
    .join('');

  const remaining = workouts.length - safeWorkouts.length;

  return `
    <svg xmlns="${XMLNS}" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f1f8e9"/>
          <stop offset="55%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#e3f2fd"/>
        </linearGradient>
        ${safeWorkouts
          .map(
            (_, index) =>
              `<linearGradient id="bundle-sparkline-gradient-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(67, 160, 71, 0.35)"/><stop offset="100%" stop-color="rgba(67, 160, 71, 0)"/></linearGradient>
               <linearGradient id="bundle-sparkline-fade-gradient-${index}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="white" stop-opacity="0"/><stop offset="18%" stop-color="white" stop-opacity="1"/><stop offset="82%" stop-color="white" stop-opacity="1"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient>
               <mask id="bundle-sparkline-fade-${index}" maskUnits="userSpaceOnUse" x="0" y="0" width="104" height="48"><rect width="104" height="48" fill="url(#bundle-sparkline-fade-gradient-${index})"/></mask>`
          )
          .join('')}
      </defs>
      <rect width="1080" height="1080" rx="72" fill="url(#bg)"/>
      <circle cx="924" cy="154" r="186" fill="#43a047" opacity="0.12"/>
      <circle cx="146" cy="926" r="210" fill="#1976d2" opacity="0.1"/>
      <text x="96" y="132" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="800" fill="#43a047">FitMo</text>
      <text x="96" y="224" font-family="Inter, Arial, sans-serif" font-size="76" font-weight="900" fill="#243e51">Exercise Momentum</text>
      <text x="96" y="286" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="700" fill="#607d8b">${workouts.length} exercises tracked · ${escapeXml(shareDateLabel)}</text>
      ${rows}
      ${
        remaining > 0
          ? `<text x="164" y="${352 + safeWorkouts.length * 72 + 40}" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" fill="#607d8b">+ ${remaining} more</text>`
          : ''
      }
      ${getFooterMarkup(988)}
    </svg>`;
}

function getWorkoutSvg({ workout, settings, shareDate }: ShareWorkoutOptions): string {
  const momentum = Math.round(getMomentum(workout));
  const sparklinePoints = getSparklinePoints(workout, 760, 170, 12);
  const sparklinePath = buildSparklinePath(sparklinePoints);
  const sparklineAreaPath = buildSparklineAreaPath(sparklinePoints, 158);
  const endpointMarkup = getEndpointMarkup(sparklinePoints, momentum, {
    fontSize: 28,
    radius: 10,
    labelPaddingX: 14,
    labelPaddingY: 8,
    labelOffsetY: -34
  });
  const shareDateLabel = formatShareDate(shareDate);

  return `
    <svg xmlns="${XMLNS}" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e8f5e9"/>
          <stop offset="58%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#fff3e0"/>
        </linearGradient>
        <linearGradient id="single-sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(67, 160, 71, 0.35)"/>
          <stop offset="100%" stop-color="rgba(67, 160, 71, 0)"/>
        </linearGradient>
        <linearGradient id="single-sparkline-fade-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="white" stop-opacity="0"/>
          <stop offset="7%" stop-color="white" stop-opacity="1"/>
          <stop offset="88%" stop-color="white" stop-opacity="1"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </linearGradient>
        <mask id="single-sparkline-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="760" height="170">
          <rect width="760" height="170" fill="url(#single-sparkline-fade-gradient)"/>
        </mask>
        <clipPath id="single-sparkline-clip">
          <rect x="0" y="0" width="760" height="170" rx="28"/>
        </clipPath>
      </defs>
      <rect width="1080" height="1080" rx="72" fill="url(#bg)"/>
      <circle cx="900" cy="150" r="190" fill="#43a047" opacity="0.14"/>
      <circle cx="172" cy="908" r="225" fill="#f9a825" opacity="0.14"/>
      <text x="96" y="132" font-family="Inter, Arial, sans-serif" font-size="40" font-weight="800" fill="#43a047">FitMo</text>
      ${getIconImageMarkup(workout.name, 96, 174, 112, 24)}
      <text x="232" y="242" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="900" fill="#243e51">${escapeXml(workout.name)}</text>
      <text x="232" y="304" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="700" fill="#607d8b">${escapeXml(getWorkoutTypeLabel(workout))} progress · ${escapeXml(shareDateLabel)}</text>
      <g transform="translate(96 382)">
        <rect width="888" height="254" rx="36" fill="#ffffff" stroke="#dcedc8" stroke-width="3"/>
        <text x="52" y="104" font-family="Inter, Arial, sans-serif" font-size="94" font-weight="900" fill="#43a047">${momentum}</text>
        <text x="54" y="154" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#7cb342">momentum score</text>
        <text x="54" y="210" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="700" fill="#607d8b">Last active: ${escapeXml(formatLastActive(workout))}</text>
        <text x="432" y="104" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="900" fill="#243e51">${escapeXml(formatDailyVolume(workout, settings, shareDate))}</text>
        <text x="432" y="154" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="800" fill="#607d8b">logged today</text>
      </g>
      <g transform="translate(160 712)">
        <rect width="760" height="170" rx="28" fill="#f5f7fa" stroke="#e0e7ec" stroke-width="2"/>
        ${
          sparklinePath
            ? `<g clip-path="url(#single-sparkline-clip)" mask="url(#single-sparkline-fade)">
                 ${sparklineAreaPath ? `<path d="${sparklineAreaPath}" fill="url(#single-sparkline-gradient)"/>` : ''}
                 <path d="${sparklinePath}" fill="none" stroke="#43a047" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
               </g>
               ${endpointMarkup}`
            : `<text x="380" y="98" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" fill="#90a4ae">Momentum history starts here</text>`
        }
      </g>
      ${getFooterMarkup(988)}
    </svg>`;
}

async function svgToPngFile(svg: string, fileName: string): Promise<File> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = SHARE_WIDTH;
    canvas.height = SHARE_HEIGHT;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas rendering is unavailable');
    }

    context.drawImage(image, 0, 0, SHARE_WIDTH, SHARE_HEIGHT);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Unable to render share image'));
        }
      }, 'image/png');
    });

    return new File([pngBlob], fileName, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to prepare share image'));
    };
    reader.readAsDataURL(blob);
  });
}

async function shareWithAndroidBridge(file: File, title: string): Promise<boolean> {
  if (!window.Android?.shareImage) {
    return false;
  }

  const base64Png = await blobToBase64(file);
  window.Android.shareImage(base64Png, file.name, title);
  return true;
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

async function shareOrDownloadPng(file: File, title: string): Promise<'shared' | 'downloaded'> {
  if (await shareWithAndroidBridge(file, title)) {
    return 'shared';
  }

  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    downloadFile(file);
    return 'downloaded';
  }

  await navigator.share({
    title,
    files: [file]
  });
  return 'shared';
}

export async function shareWorkoutProgress(options: ShareWorkoutOptions): Promise<'shared' | 'downloaded'> {
  const svg = getWorkoutSvg(options);
  const file = await svgToPngFile(svg, `${options.workout.name || 'exercise'}-progress.png`);
  return shareOrDownloadPng(file, `${options.workout.name} progress`);
}

export async function shareWorkoutBundleProgress(options: ShareBundleOptions): Promise<'shared' | 'downloaded'> {
  const svg = getBundleSvg(options);
  const file = await svgToPngFile(svg, 'fitness-momentum-progress.png');
  return shareOrDownloadPng(file, 'Fitness Momentum progress');
}
