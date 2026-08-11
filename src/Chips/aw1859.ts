/**
 * AW1859 (T113/D1-H) SoC GPIO configuration.
 *
 * This module defines the GPIO pin controller configuration for
 * the Allwinner AW1859 series SoCs, including T113 and D1-H variants.
 *
 * The configuration includes:
 * - Pin controller register base address and version
 * - Pin bank counts for each GPIO port (PB, PC, PD, PE, PF, PG)
 * - Pin multiplexing options for each GPIO pin
 *
 * Pin mux arrays define the 16 possible functions for each pin,
 * indexed by function select value (0-15):
 * - 0: gpio_in (GPIO input)
 * - 1: gpio_out (GPIO output)
 * - 2-7: Peripheral functions (UART, SPI, I2C, PWM, etc.)
 * - 14: eint (External interrupt)
 * - 15: io_disabled (IO disabled)
 *
 * Used by GPIO driver for pin configuration display and
 * register manipulation in GPIOViewer component.
 */
import type { ChipInfo } from '../Drivers/Types';

/** AW1859 chip configuration with GPIO pin mux definitions */
export const aw1859: ChipInfo = {
  id: '1859',
  chipMark: {
    "T113": 0x218B,
    "D1-H": 0x210C
  },
  pinctrl: {
    pio: {
      reg_base: 0x2000000,
      version: 2,
      pin_bank_num: {
        PB: 13,
        PC: 8,
        PD: 23,
        PE: 18,
        PF: 7,
        PG: 19
      },
      pin_mux: {
        PB0: ["gpio_in", "gpio_out", "pwm3", "ir", "twi2", "spi1", "uart0", "uart2", "owa", "test", "null", "null", "null", "null", "eint", "io_disabled"],
        PB1: ["gpio_in", "gpio_out", "pwm4", "i2s2_dout", "twi2", "i2s2_din", "uart0", "uart2", "ir", "test", "null", "null", "null", "null", "eint", "io_disabled"],
        PB10: ["gpio_in", "gpio_out", "dmic", "pwm7", "twi0", "spi1", "clk_fanout0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB11: ["gpio_in", "gpio_out", "dmic", "pwm2", "twi0", "spi1", "clk_fanout1", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB12: ["gpio_in", "gpio_out", "dmic", "pwm0", "owa", "spi1", "clk_fanout2", "ir", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB2: ["gpio_in", "gpio_out", "lcd0", "i2s2_dout", "twi0", "i2s2_din", "lcd0", "uart4", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB3: ["gpio_in", "gpio_out", "lcd0", "i2s2_dout", "twi0", "i2s2_din", "lcd0", "uart4", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB4: ["gpio_in", "gpio_out", "lcd0", "i2s2_dout", "twi1", "i2s2_din", "lcd0", "uart5", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB5: ["gpio_in", "gpio_out", "lcd0", "i2s2", "twi1", "pwm0", "lcd0", "uart5", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB6: ["gpio_in", "gpio_out", "lcd0", "i2s2", "twi3", "pwm1", "lcd0", "uart3", "bist0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB7: ["gpio_in", "gpio_out", "lcd0", "i2s2", "twi3", "ir", "lcd0", "uart3", "bist1", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB8: ["gpio_in", "gpio_out", "dmic", "pwm5", "twi2", "spi1", "uart0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PB9: ["gpio_in", "gpio_out", "dmic", "pwm6", "twi2", "spi1", "uart0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC0: ["gpio_in", "gpio_out", "uart2", "twi2", "ledc", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC1: ["gpio_in", "gpio_out", "uart2", "twi2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC2: ["gpio_in", "gpio_out", "spi0", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC3: ["gpio_in", "gpio_out", "spi0", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC4: ["gpio_in", "gpio_out", "spi0", "sdc2", "boot", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC5: ["gpio_in", "gpio_out", "spi0", "sdc2", "boot", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC6: ["gpio_in", "gpio_out", "spi0", "sdc2", "uart3", "twi3", "pll", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PC7: ["gpio_in", "gpio_out", "spi0", "sdc2", "uart3", "twi3", "tcon", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD0: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "twi0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD1: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD10: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD11: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD12: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "twi0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD13: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD14: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD15: ["gpio_in", "gpio_out", "lcd0", "lvds1", "spi1", "ir", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD16: ["gpio_in", "gpio_out", "lcd0", "lvds1", "dmic", "pwm0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD17: ["gpio_in", "gpio_out", "lcd0", "lvds1", "dmic", "pwm1", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD18: ["gpio_in", "gpio_out", "lcd0", "lvds1", "dmic", "pwm2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD19: ["gpio_in", "gpio_out", "lcd0", "lvds1", "dmic", "pwm3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD2: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD20: ["gpio_in", "gpio_out", "lcd0", "twi2", "dmic", "pwm4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD21: ["gpio_in", "gpio_out", "lcd0", "twi2", "uart1", "pwm5", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD22: ["gpio_in", "gpio_out", "owa", "ir", "uart1", "pwm7", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD3: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD4: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD5: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart5", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD6: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart5", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD7: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD8: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "uart4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PD9: ["gpio_in", "gpio_out", "lcd0", "lvds0", "dsi", "pwm6", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE0: ["gpio_in", "gpio_out", "ncsi0", "uart2", "twi1", "lcd0", "null", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE1: ["gpio_in", "gpio_out", "ncsi0", "uart2", "twi1", "lcd0", "null", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE10: ["gpio_in", "gpio_out", "ncsi0", "uart1", "pwm4", "ir", "jtag", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE11: ["gpio_in", "gpio_out", "ncsi0", "uart1", "i2s0_dout", "i2s0_din", "jtag", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE12: ["gpio_in", "gpio_out", "twi2", "ncsi0", "i2s0_dout", "i2s0_din", "null", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE13: ["gpio_in", "gpio_out", "twi2", "pwm5", "i2s0_dout", "i2s0_din", "null", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE14: ["gpio_in", "gpio_out", "twi1", "d_jtag", "i2s0_dout", "i2s0_din", "dmic", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE15: ["gpio_in", "gpio_out", "twi1", "d_jtag", "pwm6", "i2s0", "dmic", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE16: ["gpio_in", "gpio_out", "twi3", "d_jtag", "pwm7", "i2s0", "dmic", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE17: ["gpio_in", "gpio_out", "twi3", "d_jtag", "ir", "i2s0", "dmic", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE2: ["gpio_in", "gpio_out", "ncsi0", "uart2", "twi0", "clk_fanout0", "uart0", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE3: ["gpio_in", "gpio_out", "csi0", "uart2", "twi0", "clk_fanout1", "uart0", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE4: ["gpio_in", "gpio_out", "ncsi0", "uart4", "twi2", "clk_fanout2", "d_jtag", "r_jtag", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE5: ["gpio_in", "gpio_out", "ncsi0", "uart4", "twi2", "ledc", "d_jtag", "r_jtag", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE6: ["gpio_in", "gpio_out", "ncsi0", "uart5", "twi3", "owa", "d_jtag", "r_jtag", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE7: ["gpio_in", "gpio_out", "ncsi0", "uart5", "twi3", "owa", "d_jtag", "r_jtag", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE8: ["gpio_in", "gpio_out", "ncsi0", "uart1", "pwm2", "uart3", "jtag", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PE9: ["gpio_in", "gpio_out", "ncsi0", "uart1", "pwm3", "uart3", "jtag", "null", "gmac0", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF0: ["gpio_in", "gpio_out", "sdc0", "jtag", "r_jtag", "i2s2_dout", "i2s2_din", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF1: ["gpio_in", "gpio_out", "sdc0", "jtag", "r_jtag", "i2s2_dout", "i2s2_din", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF2: ["gpio_in", "gpio_out", "sdc0", "uart0", "twi0", "ledc", "owa", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF3: ["gpio_in", "gpio_out", "sdc0", "jtag", "r_jtag", "i2s2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF4: ["gpio_in", "gpio_out", "sdc0", "uart0", "twi0", "pwm6", "ir", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF5: ["gpio_in", "gpio_out", "sdc0", "jtag", "r_jtag", "i2s2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PF6: ["gpio_in", "gpio_out", "null", "owa", "ir", "i2s2", "pwm5", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG0: ["gpio_in", "gpio_out", "sdc1", "uart3", "gmac0", "pwm7", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG1: ["gpio_in", "gpio_out", "sdc1", "uart3", "gmac0", "pwm6", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG10: ["gpio_in", "gpio_out", "pwm3", "twi3", "gmac0", "clk_fanout0", "ir", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG11: ["gpio_in", "gpio_out", "i2s1", "twi3", "gmac0", "clk_fanout1", "tcon", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG12: ["gpio_in", "gpio_out", "i2s1", "twi0", "gmac0", "fanout2", "pwm0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG13: ["gpio_in", "gpio_out", "i2s1", "twi0", "gmac0", "pwm2", "ledc", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG14: ["gpio_in", "gpio_out", "i2s1_din", "twi2", "gmac0", "i2s1_dout", "spi0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG15: ["gpio_in", "gpio_out", "i2s1_dout", "twi2", "gmac0", "i2s1_din", "spi0", "uart1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG16: ["gpio_in", "gpio_out", "ir", "tcon", "pwm5", "clk_fanout2", "owa", "ledc", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG17: ["gpio_in", "gpio_out", "uart2", "twi3", "pwm7", "clk_fanout0", "ir", "uart0", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG18: ["gpio_in", "gpio_out", "uart2", "twi3", "pwm6", "clk_fanout1", "owa", "uart0", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG2: ["gpio_in", "gpio_out", "sdc1", "uart3", "gmac0", "uart4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG3: ["gpio_in", "gpio_out", "sdc1", "uart3", "gmac0", "uart4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG4: ["gpio_in", "gpio_out", "sdc1", "uart5", "gmac0", "pwm5", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG5: ["gpio_in", "gpio_out", "sdc1", "uart5", "gmac0", "pwm4", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG6: ["gpio_in", "gpio_out", "uart1", "twi2", "gmac0", "pwm1", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG7: ["gpio_in", "gpio_out", "uart1", "twi2", "gmac0", "owa", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG8: ["gpio_in", "gpio_out", "uart1", "twi1", "gmac0", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
        PG9: ["gpio_in", "gpio_out", "uart1", "twi0", "gmac0", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"]
      },
    },
  }
};