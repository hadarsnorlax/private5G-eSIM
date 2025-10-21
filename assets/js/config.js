// Publish your Google Sheet as CSV (File → Share → Publish to web → CSV)
// You can also override at runtime: ?csv=<published-csv-url>
window.ESIM_HELPER_CONFIG = {
  SHEET_CSV_URL: "https://example.com/your-sheet.csv",
  DEMO_ROW: {
    id: "demo-001",
    name: "Demo User",
    activation_code: "1$SMDP.GDSB.GSMA.COM$ACT-1234-5678-ABCD",
    smdp: "SMDP.GDSB.GSMA.COM",
    iccid: "8901234567890123456",
    imsi: "310150123456789",
    apn_name: "Event 5G APN",
    apn_apn: "apn.event5g.local",
    apn_user: "",
    apn_pass: "",
    apn_mcc: "001",
    apn_mnc: "01",
    operator_code: "12345",
    qr_url: ""
  }
};
