"""Read-only extraction of the supplied FY26 workbook's aggregate validation controls.
Usage: python3 finance/marketplaces/extract-controls.py WORKBOOK OUTPUT_JSON
Requires openpyxl. Does not save or modify the workbook; never extracts customer/order IDs.
"""
import sys, json, hashlib
from pathlib import Path
from decimal import Decimal
import openpyxl
source, output = map(Path, sys.argv[1:3])
def minor(value):
    return int(Decimal(str(value)) * 100)
workbook = openpyxl.load_workbook(source, read_only=True, data_only=False)
months = {}
for row in list(workbook['Monthly reconciliation'].values)[4:16]:
    month = str(row[0])[:7]
    months[month] = {
        'complete': True, 'currency': 'GBP', 'timezone': 'Europe/London',
        'orders': int(row[2]), 'gross_sales': minor(row[5]),
        'discounts': minor(row[7]), 'net_sales': minor(row[5]) - minor(row[7]),
        'total_sales': minor(row[12]), 'shipping': minor(row[11]),
        # Supplied FY26 Sold Orders report Sales Tax=0; importer independently validates it.
        'tax': 0, 'payment_records': int(row[15]), 'payment_gross': minor(row[9]),
        'refunds': minor(row[10]), 'fees': minor(row[14]),
        'legacy_gross': minor(row[4]), 'legacy_orders': int(row[1]),
    }
if len(months) != 12:
    raise ValueError('Expected all twelve supplied FY26 source-control months')
result = {
    'source': source.name, 'workbook_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'native_stats_revenue': minor(workbook['Executive summary']['B11'].value),
    'native_stats_orders': int(workbook['Executive summary']['B14'].value),
    'monthly_controls': months,
    'source_note': 'Monthly source columns F/H reproduce Stats revenue; annual Stats revenue is independent executive-summary B11. No asserted monthly Stats-native export beyond supplied workbook.',
}
workbook.close()
output.write_text(json.dumps(result, indent=2) + '\n')
