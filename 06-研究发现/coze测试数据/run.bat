@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "mapping.csv" (
  echo 缺少 mapping.csv。请复制 mapping.example.csv 为 mapping.csv，并填入需要替换的真实名称。
  pause
  exit /b 1
)

python anonymize.py --raw "..\coze-抽取测试记录.csv" --expected "v1\expected.csv" --out "v1\labels.csv" --date "2026-10-18" --mapping "mapping.csv"
if errorlevel 1 (
  pause
  exit /b 1
)

python score.py --input "v1\labels.csv"
pause
