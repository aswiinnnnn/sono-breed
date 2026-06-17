import asyncio
import platform
import os
import ctypes
import torch
from fastapi import APIRouter
from app.probe_source import check_probe_status, connect_probe

router = APIRouter()

class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)
    ]

@router.get("/api/system-info")
async def system_info():
    os_name = f"{platform.system()} {platform.release()}"
    cpu_name = platform.processor() or "AMD/Intel Processor"
    cores = os.cpu_count() or 1
    
    cuda_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else "CPU (No CUDA Device)"
    
    # Dynamically fetch RAM size and RAM load using Windows kernel32
    ram_gb = "Unknown GB"
    ram_load = 0
    try:
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(stat)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        ram_gb = f"{round(stat.ullTotalPhys / (1024**3), 1)} GB"
        ram_load = int(stat.dwMemoryLoad)
    except Exception:
        pass

    return {
        "os": os_name,
        "cpu": cpu_name,
        "ram": ram_gb,
        "ram_load": ram_load,
        "gpu": gpu_name,
        "cores": cores,
        "cuda_available": cuda_available,
        "probe_connected": check_probe_status()
    }

@router.post("/api/probe/connect")
async def connect_probe_endpoint():
    # TODO / MIMIC: Mimic a 2-second hardware probe handshake delay
    await asyncio.sleep(2.0)
    connect_probe()
    return {
        "success": True,
        "probe_connected": True
    }
