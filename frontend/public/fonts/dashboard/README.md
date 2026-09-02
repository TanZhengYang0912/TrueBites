# Dashboard PDF fonts

These SIL Open Font License 1.1 fonts are served locally and loaded only when
exporting the admin dashboard. No customer/admin data is sent to a font service.

Sources (Google Fonts official repository, downloaded 2026-09-03):

- Noto Sans: https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf
- Noto Sans SC: https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf
- Licenses: `OFL-NotoSans.txt`, `OFL-NotoSansSC.txt` alongside these files.

Static TrueType instances were created with fontTools (jsPDF does not evaluate
the source font's variable axes). Reproduction commands:

```sh
python3 -m fontTools.varLib.instancer --static --update-name-table -o NotoSans-Regular.ttf 'NotoSans[wdth,wght].ttf' wdth=100 wght=400
python3 -m fontTools.varLib.instancer --static --update-name-table -o NotoSans-Bold.ttf 'NotoSans[wdth,wght].ttf' wdth=100 wght=700
python3 -m fontTools.varLib.instancer --static --update-name-table -o NotoSansSC-Regular.ttf 'NotoSansSC[wght].ttf' wght=400
```

Latin text has regular and bold styles. Chinese fallback uses the regular SC
font, including in otherwise-bold mixed text, to avoid a second large font.
The CJK asset is downloaded only if the report needs characters not present in
the Latin font. Text remains selectable/searchable; unsupported characters
produce a visible export error rather than a silently corrupted PDF.
