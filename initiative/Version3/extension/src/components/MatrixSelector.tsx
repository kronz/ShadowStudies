export type MatrixConfig = {
  morningHour: number;
  noonHour: number;
  eveningHour: number;
};

export type MatrixTimeStep = {
  month: number;
  day: number;
  hour: number;
  minute: number;
  label: string;
};

const SEASONS = [
  { label: "Summer solstice", month: 6, day: 21 },
  { label: "Equinox", month: 3, day: 20 },
  { label: "Winter solstice", month: 12, day: 21 },
] as const;

/**
 * Generates the 9 time steps for a 3x3 matrix export.
 */
export function getMatrixTimeSteps(config: MatrixConfig): MatrixTimeStep[] {
  const times = [
    { hour: config.morningHour, label: "Morning" },
    { hour: config.noonHour, label: "Noon" },
    { hour: config.eveningHour, label: "Evening" },
  ];

  const steps: MatrixTimeStep[] = [];
  for (const season of SEASONS) {
    for (const time of times) {
      steps.push({
        month: season.month,
        day: season.day,
        hour: time.hour,
        minute: 0,
        label: `${season.label} - ${time.label} (${time.hour}:00)`,
      });
    }
  }
  return steps;
}

/**
 * Generates a filename-safe label for a matrix step.
 */
export function matrixStepFilename(step: MatrixTimeStep): string {
  const seasonNames: Record<number, string> = {
    6: "summer-solstice",
    3: "equinox",
    12: "winter-solstice",
  };
  const season = seasonNames[step.month] ?? `month-${step.month}`;
  const time = `${String(step.hour).padStart(2, "0")}-${String(step.minute).padStart(2, "0")}`;
  return `${season}_${time}.png`;
}

type MatrixSelectorProps = {
  config: MatrixConfig;
  onConfigChange: (config: MatrixConfig) => void;
};

export default function MatrixSelector({ config, onConfigChange }: MatrixSelectorProps) {
  return (
    <>
      <div class="section-header">3×3 Matrix Settings</div>

      <div class="matrix-grid">
        <div></div>
        <div class="matrix-header">Morning</div>
        <div class="matrix-header">Noon</div>
        <div class="matrix-header">Evening</div>

        {SEASONS.map((season) => (
          <>
            <div class="matrix-row-label">{season.label}</div>
            <div class="matrix-cell">
              {season.month}/{season.day} {config.morningHour}:00
            </div>
            <div class="matrix-cell">
              {season.month}/{season.day} {config.noonHour}:00
            </div>
            <div class="matrix-cell">
              {season.month}/{season.day} {config.eveningHour}:00
            </div>
          </>
        ))}
      </div>

      <div class="row">
        <div class="row-title" style={{ width: "40%" }}>
          Morning:
        </div>
        <div class="row-item">
          <weave-select
            value={String(config.morningHour)}
            onChange={(e: any) =>
              onConfigChange({ ...config, morningHour: parseInt(e.detail.value, 10) })
            }
          >
            {[7, 8, 9, 10].map((h) => (
              <weave-select-option key={String(h)} value={String(h)}>
                {`${h}:00`}
              </weave-select-option>
            ))}
          </weave-select>
        </div>
      </div>

      <div class="row">
        <div class="row-title" style={{ width: "40%" }}>
          Noon:
        </div>
        <div class="row-item">
          <weave-select
            value={String(config.noonHour)}
            onChange={(e: any) =>
              onConfigChange({ ...config, noonHour: parseInt(e.detail.value, 10) })
            }
          >
            {[11, 12, 13].map((h) => (
              <weave-select-option key={String(h)} value={String(h)}>
                {`${h}:00`}
              </weave-select-option>
            ))}
          </weave-select>
        </div>
      </div>

      <div class="row">
        <div class="row-title" style={{ width: "40%" }}>
          Evening:
        </div>
        <div class="row-item">
          <weave-select
            value={String(config.eveningHour)}
            onChange={(e: any) =>
              onConfigChange({ ...config, eveningHour: parseInt(e.detail.value, 10) })
            }
          >
            {[14, 15, 16, 17].map((h) => (
              <weave-select-option key={String(h)} value={String(h)}>
                {`${h}:00`}
              </weave-select-option>
            ))}
          </weave-select>
        </div>
      </div>
    </>
  );
}
