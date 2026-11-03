export function PipeTable({ value }: { value: string }) {
  const rows = String(value ?? '')
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split('|').map((cell) => cell.trim()));

  if (!rows.length) return <p className="sm muted">Belum ada tabel.</p>;

  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            {rows[0].map((cell, index) => (
              <th key={index}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {rows[0].map((_, cellIndex) => (
                <td key={cellIndex}>{row[cellIndex] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
