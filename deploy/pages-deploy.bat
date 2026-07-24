@echo off
:: Deploy entry point - calls PowerShell script for secure token input
powershell -ExecutionPolicy Bypass -File "%~dp0pages-deploy.ps1"
