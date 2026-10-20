import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The table view behind a chart: every plotted value, reachable without hovering. */
export function ChartTable({
  summary,
  headers,
  rows,
}: {
  summary: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
        {summary}
      </summary>
      <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((cell, i) => (
                  <TableCell key={i} className="tabular-nums">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
