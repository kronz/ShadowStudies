type CellSizeSelectorProps = {
  cellSize: number;
  setCellSize: (size: number) => void;
};

export default function CellSizeSelector({ cellSize, setCellSize }: CellSizeSelectorProps) {
  return (
    <div class="row">
      <div class="row-title">Resolution</div>
      <div class="row-item">
        <weave-select
          value={String(cellSize)}
          onChange={(event) => setCellSize(parseFloat((event as CustomEvent).detail.value))}
        >
          <weave-select-option value="2">Draft (2m)</weave-select-option>
          <weave-select-option value="1">Standard (1m)</weave-select-option>
          <weave-select-option value="0.5">Fine (0.5m)</weave-select-option>
        </weave-select>
      </div>
    </div>
  );
}
