"""驱动基类（可选）—— 给用户写自己的外设驱动一个统一、轻量的骨架。

本模块**不强制**使用：你可以像 ``oled.py`` 那样直接组合 ``SpiTester`` / ``I2CTester`` 写驱动，
也可以继承这里的基类获得统一的生命周期与上下文管理。两种都是官方支持的写法。

设计意图：用户（不能改包源码）想驱动自己的屏幕/模块时，在自己的用户工作区目录写一个
继承 ``SpiDriver`` / ``I2CDriver`` 的类，实现芯片特有的 ``init()`` / 读写方法即可，
脚本里 ``from my_driver import MyScreen`` 导入使用。基础层（HTTP 客户端 + Tester）保持稳定。

生命周期约定（与上下文管理器一致）::

    with MySpiScreen(client, index=0) as screen:   # open() 打开设备 + 初始化 SPI 传输
        screen.init()                              # 芯片特有初始化
        screen.show_text("Hi")
    # 退出 with 自动 close()
"""

from __future__ import annotations

from typing import Optional

from .client import UsbToolBoxClient
from .spi_tester import SpiTester
from .i2c_tester import I2CTester


class Driver:
    """所有驱动的可选基类：持有 client，提供 open/close 与上下文管理。

    子类一般在 ``open()`` 里创建并打开对应总线的 Tester，在 ``close()`` 里释放。
    """

    def __init__(self, client: UsbToolBoxClient):
        self.client = client

    def open(self) -> "Driver":
        """打开资源。默认 no-op，子类覆盖。返回 self 以支持链式。"""
        return self

    def close(self) -> None:
        """释放资源。默认 no-op，子类覆盖。"""

    # ─── 上下文管理 ───
    def __enter__(self) -> "Driver":
        self.open()
        return self

    def __exit__(self, *exc) -> None:
        self.close()


class SpiDriver(Driver):
    """SPI 外设驱动基类。

    子类设置类属性 ``index`` / ``spi_mode`` / ``spi_speed_mhz`` / ``spi_cs``，
    或在 ``__init__`` 里传参。``open()`` 会创建并初始化 :class:`SpiTester` 存到 ``self.spi``。
    """

    index: int = 0
    spi_mode: int = 0
    spi_speed_mhz: int = 8
    spi_cs: int = 0

    def __init__(self, client: UsbToolBoxClient, *, index: Optional[int] = None,
                 spi_mode: Optional[int] = None, spi_speed_mhz: Optional[int] = None,
                 spi_cs: Optional[int] = None):
        super().__init__(client)
        if index is not None:
            self.index = index
        if spi_mode is not None:
            self.spi_mode = spi_mode
        if spi_speed_mhz is not None:
            self.spi_speed_mhz = spi_speed_mhz
        if spi_cs is not None:
            self.spi_cs = spi_cs
        self.spi: Optional[SpiTester] = None

    def open(self) -> "SpiDriver":
        """打开 CH347 设备并初始化 SPI 传输层（不触碰芯片）。"""
        self.spi = SpiTester(self.client, index=self.index).open()
        self.spi.init(mode=self.spi_mode, speed_mhz=self.spi_speed_mhz, cs=self.spi_cs,
                      data_bits=8, byte_order=1)
        return self

    def close(self) -> None:
        if self.spi is not None:
            try:
                self.spi.close()
            except Exception:
                pass
            self.spi = None


class I2CDriver(Driver):
    """I2C 外设驱动基类。

    子类设置 ``index`` / ``i2c_speed_khz``。``open()`` 会创建并打开 :class:`I2CTester` 存到 ``self.i2c``。
    """

    index: int = 0
    i2c_speed_khz: Optional[int] = None

    def __init__(self, client: UsbToolBoxClient, *, index: Optional[int] = None,
                 i2c_speed_khz: Optional[int] = None):
        super().__init__(client)
        if index is not None:
            self.index = index
        if i2c_speed_khz is not None:
            self.i2c_speed_khz = i2c_speed_khz
        self.i2c: Optional[I2CTester] = None

    def open(self) -> "I2CDriver":
        self.i2c = I2CTester(self.client, index=self.index, speed_khz=self.i2c_speed_khz).open()
        return self

    def close(self) -> None:
        if self.i2c is not None:
            try:
                self.i2c.close()
            except Exception:
                pass
            self.i2c = None
