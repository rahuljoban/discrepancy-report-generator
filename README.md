# RFID Discrepancy Audit Generator

A Google Sheets tool that automates the filtering, cleanup, and formatting
steps of a retail RFID inventory audit — turning a repetitive, error-prone
manual process into a single menu click.

> Column names, category codes, and the exclusion keyword list in this repo
> are genericized examples. In production, these would reflect a specific
> retailer's actual system field names and the third-party brands they
> carry — details left out here since they're specific to a real employer.

## The problem this solves

Retail stores using RFID inventory tracking regularly compare a physical
scan count against the expected count in a separate inventory system, then
manually work through a long list of spreadsheet filters to isolate real
discrepancies worth investigating: removing zero-difference rows, filtering
out out-of-scope categories, excluding third-party/multibrand items that
don't apply that day, and formatting the result for a paper audit trail.

Done by hand, this is 15-20 repetitive filter/sort/delete steps *per scan*,
usually done early morning before a store opens — exactly the kind of
repetitive task where tired hands make mistakes (an accidentally-deleted
row, a missed filter step, an inconsistent sort).

## What it automates — and why it matters

| Manual step | Automated equivalent | Impact |
|---|---|---|
| Rename/clean ~10 columns, delete unneeded ones | One click | Seconds instead of minutes, every time |
| Compute discrepancy and drop zero/small differences | Configurable minimum-discrepancy filter | Consistent threshold — no more "did I filter this right?" |
| Filter to the right category/department | Dropdown selection | No manual filter-menu clicking through hundreds of rows |
| Exclude multibrand/third-party items by keyword | Automated keyword + whole-word matching | Removes human error from matching (e.g. this project caught a bug where naive keyword matching would've wrongly deleted real house-brand items like "Ringer Tee" and "String Bikini" for containing the substring "ring") |
| Sort and format for printing/audit | Automatic | Consistent output every time, no formatting drift between days |

**Net effect:** what was a 10-15 minute, easy-to-mess-up manual process
becomes a ~10 second automated one, with the exclusion logic centralized
and testable instead of re-applied by hand (and re-interpreted slightly
differently) by whoever's doing the audit that morning.

## What it does

From a raw RFID stock-count export, it:

- Computes `Disc = Scanned Count − System Expected`
- Drops rows with zero discrepancy, and any below a configurable minimum
- Filters to a chosen category scope, **or** switches to an "Accessory day"
  mode that includes only accessory-type categories and skips the
  multibrand exclusion entirely
- Excludes multibrand/third-party items via a keyword list — with care
  taken around short/common substrings (e.g. matching "ring" as a whole
  word only, so it doesn't also catch "Ringer Tee" or "String Bikini")
- Excludes a seasonal/rotating item category unless its scheduled inclusion
  day is toggled on
- Sorts by SKU and writes a clean new tab with quantity, discrepancy, and
  blank columns for a two-location hand recount (with live formulas that
  total the recount and compute the final adjustment automatically)

## What's intentionally still manual

- The physical RFID scan itself
- The hand recount for flagged discrepancies (by design — this needs a
  person on the floor, not a script)
- Final review and sign-off before the report goes out

## Install

1. Open a Google Sheet with a tab containing the raw export (see
   `SampleStockCount.csv` for the expected shape).
2. Go to **Extensions > Apps Script**.
3. Replace `Code.gs`'s contents with this repo's `Code.gs`.
4. Add an HTML file named exactly `Dialog`, paste in this repo's `Dialog.html`.
5. Save, reload the spreadsheet, then run
   **RFID Discrepancy Audit > Generate Adjustment Report** from the menu.

## Notes

- `SampleStockCount.csv` is fully synthetic data for demoing the tool.
- The keyword list and category logic are constants near the top of
  `Code.gs` — straightforward to adapt to a real system's actual field
  names and exclusion list.
