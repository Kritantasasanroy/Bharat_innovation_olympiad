export function csvCell(value: string | number | null | undefined): string {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function downloadCsv(
    filename: string,
    header: string[],
    rows: (string | number | null | undefined)[][],
): void {
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
        lines.push(row.map(csvCell).join(','));
    }
    const csv = lines.join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = filename;
    a.click();
}
