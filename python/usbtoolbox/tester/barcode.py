"""SN 条码输入（HID 条码枪 / 键盘 / 标准输入）。

绝大多数 USB 条码枪是"键盘楔入"（keyboard-wedge）设备：扫码后把条码当键盘输入打出来、
末尾跟一个回车。因此在软件内置运行台里运行脚本时，直接用标准输入按行读取即可同时支持
条码枪与手工键盘输入。

仅依赖标准库。
"""

from __future__ import annotations

import os
import re
import sys
from typing import Optional, Pattern, TextIO, Union


class BarcodeScanner:
    """从输入流按行读取 SN（默认 ``sys.stdin``）。

    :param stream:   输入流，默认标准输入（条码枪键盘楔入 / 手工输入）。
    :param validate: 校验正则（字符串或已编译），不匹配则视为无效。
    """

    def __init__(self, stream: Optional[TextIO] = None,
                 validate: Optional[Union[str, Pattern]] = None):
        self.stream = stream or sys.stdin
        self.validate: Optional[Pattern] = (
            re.compile(validate) if isinstance(validate, str) else validate
        )

    def read(self, prompt: str = "请扫码/输入 SN 后回车：", *, retries: int = 0,
             strip: bool = True) -> str:
        """读取一个 SN。无效（空或不匹配 validate）时最多重试 ``retries`` 次。

        :raises ValueError: 超过重试次数仍无效，或输入流结束（EOF）。
        """
        attempt = 0
        while True:
            attempt += 1
            if prompt:
                sys.stdout.write(prompt)
                sys.stdout.flush()
            line = self.stream.readline()
            if line == "":
                raise ValueError("输入流已结束（EOF），未读到 SN")
            sn = line.strip() if strip else line.rstrip("\r\n")
            if sn and (self.validate is None or self.validate.search(sn)):
                return sn
            if attempt > retries:
                raise ValueError(f"SN 无效：{sn!r}")
            sys.stdout.write("SN 无效，请重试。\n")
            sys.stdout.flush()


def read_sn(prompt: str = "请扫码/输入 SN 后回车：", *,
            validate: Optional[Union[str, Pattern]] = None,
            retries: int = 0,
            env_var: str = "USBTOOLBOX_SN") -> str:
    """读取一个 SN 的便捷函数。

    若设置了环境变量 ``env_var``（默认 ``USBTOOLBOX_SN``），优先用它（便于自动化 / CI），
    否则从标准输入读取（支持条码枪键盘楔入）。
    """
    env = os.environ.get(env_var)
    if env:
        sn = env.strip()
        pat = re.compile(validate) if isinstance(validate, str) else validate
        if pat is not None and not pat.search(sn):
            raise ValueError(f"环境变量 {env_var} 中的 SN 无效：{sn!r}")
        return sn
    return BarcodeScanner(validate=validate).read(prompt, retries=retries)
