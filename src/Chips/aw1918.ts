import type { ChipInfo } from '../Drivers/Types';

export const aw1918: ChipInfo = {
    id: '1918',
    chipMark: {
        "V861": 0x0,
        "V881MX-XXX": 0x4000
    },
    pinctrl: {
        pio: {
            reg_base: 0x2000000,
            version: 2,
            pin_bank_num: {
                PA: 22,
                PC: 12,
                PD: 23,
                PE: 18,
                PF: 7,
                PG: 8,
                PH: 16
            },
            pin_mux: {
                PA0: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA1: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA10: ["gpio_in", "gpio_out", "mcsib", "ncsi", "pwm_13", "twi0", "clk", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA11: ["gpio_in", "gpio_out", "mcsib", "ncsi", "pwm_14", "twi0", "clk", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA12: ["gpio_in", "gpio_out", "null", "ncsi", "mcsi0", "uart0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA13: ["gpio_in", "gpio_out", "csi0", "ncsi", "mcsi1", "uart0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA14: ["gpio_in", "gpio_out", "csi1", "ncsi", "mcsi2", "clk", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA15: ["gpio_in", "gpio_out", "null", "ncsi", "twi1", "clk", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA16: ["gpio_in", "gpio_out", "null", "ncsi", "twi1", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA17: ["gpio_in", "gpio_out", "csi0", "ncsi", "twi0", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA18: ["gpio_in", "gpio_out", "null", "ncsi", "twi0", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA19: ["gpio_in", "gpio_out", "null", "ncsi", "null", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA2: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA20: ["gpio_in", "gpio_out", "null", "ncsi", "null", "tcon", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA21: ["gpio_in", "gpio_out", "null", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA3: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA4: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA5: ["gpio_in", "gpio_out", "mcsia", "ncsi", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA6: ["gpio_in", "gpio_out", "mcsib", "ncsi", "twi1", "pwm_0", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA7: ["gpio_in", "gpio_out", "mcsib", "ncsi", "twi1", "pwm_1", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA8: ["gpio_in", "gpio_out", "mcsib", "twi2", "twi3", "pwm_2", "uart2", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PA9: ["gpio_in", "gpio_out", "mcsib", "twi2", "twi3", "pwm_3", "uart2", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC0: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "null", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC1: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "null", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC10: ["gpio_in", "gpio_out", "spif", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC11: ["gpio_in", "gpio_out", "null", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC2: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "boot", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC3: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "boot", "null", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC4: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "pwm_4", "twi1", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC5: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "pwm_5", "twi1", "sqpi", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC6: ["gpio_in", "gpio_out", "spif", "sdc2", "spi0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC7: ["gpio_in", "gpio_out", "spif", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC8: ["gpio_in", "gpio_out", "spif", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PC9: ["gpio_in", "gpio_out", "spif", "sdc2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD0: ["gpio_in", "gpio_out", "lcd", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD1: ["gpio_in", "gpio_out", "lcd", "pwm_0", "rmii_0", "null", "spi1", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD10: ["gpio_in", "gpio_out", "lcd", "i2s0_mclk", "null", "null", "null", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD11: ["gpio_in", "gpio_out", "lcd", "i2s0_bclk", "null", "null", "null", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD12: ["gpio_in", "gpio_out", "lcd", "i2s0_lrck", "null", "null", "null", "pwm_11", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD13: ["gpio_in", "gpio_out", "lcd", "i2s0_dout0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD14: ["gpio_in", "gpio_out", "lcd", "i2s0_dout1", "i2s0_din1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD15: ["gpio_in", "gpio_out", "lcd", "i2s0_dout2", "i2s0_din2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD16: ["gpio_in", "gpio_out", "lcd", "i2s0_dout3", "i2s0_din3", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD17: ["gpio_in", "gpio_out", "lcd", "i2s0_din0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD18: ["gpio_in", "gpio_out", "lcd", "pwm_12", "rmii", "spi1", "twi3", "uart2", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD19: ["gpio_in", "gpio_out", "lcd", "pwm_9", "tcon", "spi1", "twi3", "uart2", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD2: ["gpio_in", "gpio_out", "lcd", "pwm_1", "rmii_0", "null", "spi1", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD20: ["gpio_in", "gpio_out", "lcd", "twi0", "rmii", "spi1", "twi2", "uart2", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD21: ["gpio_in", "gpio_out", "lcd", "twi0", "rmii", "spi1", "twi2", "uart2", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD22: ["gpio_in", "gpio_out", "tcon", "pwm_9", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD3: ["gpio_in", "gpio_out", "lcd", "pwm_2", "rmii_0", "null", "spi1", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD4: ["gpio_in", "gpio_out", "lcd", "pwm_3", "rmii_0", "null", "spi1", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD5: ["gpio_in", "gpio_out", "lcd", "pwm_4", "rmii_0", "null", "spi1", "rmii_0", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD6: ["gpio_in", "gpio_out", "lcd", "pwm_5", "rmii_0", "null", "spi1", "rmii_0", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD7: ["gpio_in", "gpio_out", "lcd", "pwm_6", "rmii_0", "null", "spi1", "rmii_0", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD8: ["gpio_in", "gpio_out", "lcd", "pwm_7", "rmii_0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PD9: ["gpio_in", "gpio_out", "lcd", "pwm_8", "null", "null", "null", "rmii_1", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE0: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_0", "sdc1", "spi2", "twi3", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE1: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_1", "sdc1", "spi2", "twi3", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE10: ["gpio_in", "gpio_out", "ncsi", "rmii", "spi2", "pwm_10", "uart2", "i2s0_bclk", "twi2", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE11: ["gpio_in", "gpio_out", "ncsi", "null", "spi2", "csi0", "uart2", "i2s0_mclk", "twi2", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE12: ["gpio_in", "gpio_out", "ncsi", "pwm_12", "csi1", "mcsi0", "uart2", "uart3", "twi3", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE13: ["gpio_in", "gpio_out", "ncsi", "pwm_13", "null", "mcsi1", "uart2", "uart3", "twi3", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE14: ["gpio_in", "gpio_out", "ncsi", "pwm_14", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE15: ["gpio_in", "gpio_out", "ncsi", "pwm_15", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE16: ["gpio_in", "gpio_out", "twi0", "twi2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE17: ["gpio_in", "gpio_out", "twi0", "twi2", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE2: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_2", "sdc1", "spi2", "twi1", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE3: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_3", "sdc1", "spi2", "twi1", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE4: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_4", "sdc1", "twi3", "twi0", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE5: ["gpio_in", "gpio_out", "ncsi", "rmii", "lcd", "pwm_5", "sdc1", "twi3", "twi0", "sqpi", "null", "null", "null", "null", "eint", "io_disabled"],
                PE6: ["gpio_in", "gpio_out", "ncsi", "rmii", "null", "pwm_6", "uart3", "null", "twi2", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE7: ["gpio_in", "gpio_out", "ncsi", "rmii", "null", "pwm_7", "uart3", "i2s0_dout0", "twi2", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE8: ["gpio_in", "gpio_out", "ncsi", "rmii", "spi2", "pwm_8", "uart1", "i2s0_din0", "twi1", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PE9: ["gpio_in", "gpio_out", "ncsi", "rmii", "spi2", "pwm_9", "uart1", "i2s0_lrck", "twi1", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF0: ["gpio_in", "gpio_out", "sdc0", "e907", "spi0", "null", "c907", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF1: ["gpio_in", "gpio_out", "sdc0", "e907", "spi0", "null", "c907", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF2: ["gpio_in", "gpio_out", "sdc0", "uart0", "spi0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF3: ["gpio_in", "gpio_out", "sdc0", "e907", "spi0", "null", "c907", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF4: ["gpio_in", "gpio_out", "sdc0", "uart0", "spi0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF5: ["gpio_in", "gpio_out", "sdc0", "e907", "null", "null", "c907", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PF6: ["gpio_in", "gpio_out", "pll", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG0: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG1: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG2: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG3: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG4: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG5: ["gpio_in", "gpio_out", "sdc1", "lcd", "uart1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG6: ["gpio_in", "gpio_out", "twi3", "clk", "uart1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PG7: ["gpio_in", "gpio_out", "twi3", "clk", "uart1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH0: ["gpio_in", "gpio_out", "pwm_0", "i2s0_mclk", "pwm_12", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH1: ["gpio_in", "gpio_out", "pwm_1", "i2s0_bclk", "pwm_13", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH10: ["gpio_in", "gpio_out", "e907", "rmii", "twi3", "uart0", "i2s0_dout0", "c907", "pwm_5", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH11: ["gpio_in", "gpio_out", "e907", "rmii", "spi2", "twi2", "clk", "c907", "pwm_6", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH12: ["gpio_in", "gpio_out", "e907", "rmii", "spi2", "twi2", "clk", "c907", "pwm_7", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH13: ["gpio_in", "gpio_out", "pwm_9", "rmii", "spi2", "twi3", "uart0", "null", "pwm_8", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH14: ["gpio_in", "gpio_out", "pwm_10", "rmii", "spi2", "twi3", "uart0", "null", "pwm_14", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH15: ["gpio_in", "gpio_out", "clk", "rmii", "spi2", "null", "null", "null", "pwm_15", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH2: ["gpio_in", "gpio_out", "pwm_2", "i2s0_lrck", "pwm_14", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH3: ["gpio_in", "gpio_out", "pwm_3", "i2s0_dout0", "pwm_15", "uart3", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH4: ["gpio_in", "gpio_out", "pwm_4", "i2s0_din0", "null", "clk", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH5: ["gpio_in", "gpio_out", "pwm_5", "rmii", "twi2", "uart2", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH6: ["gpio_in", "gpio_out", "pwm_6", "rmii", "twi2", "uart2", "i2s0_mclk", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH7: ["gpio_in", "gpio_out", "pwm_7", "rmii", "uart0", "uart2", "i2s0_bclk", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH8: ["gpio_in", "gpio_out", "pwm_8", "rmii", "uart0", "uart2", "i2s0_lrck", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PH9: ["gpio_in", "gpio_out", "e907", "rmii", "twi3", "uart0", "i2s0_din0", "c907", "pwm_4", "null", "null", "null", "null", "null", "eint", "io_disabled"]
            },
        },
        rtc_pio: {
            reg_base: 0x2000540,
            version: 2,
            pin_bank_num: {
                PL: 7
            },
            pin_mux: {
                PL0: ["gpio_in", "gpio_out", "s_twi1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL1: ["gpio_in", "gpio_out", "s_twi1", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL2: ["gpio_in", "gpio_out", "s_csi0", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL3: ["gpio_in", "gpio_out", "s_twi2", "s_uart0", "s_uart2", "s_csi0", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL4: ["gpio_in", "gpio_out", "s_twi2", "s_uart0", "s_uart2", "s_csi1", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL5: ["gpio_in", "gpio_out", "s_twi0", "s_uart3", "s_uart2", "s_csi1", "null", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"],
                PL6: ["gpio_in", "gpio_out", "s_twi0", "s_uart3", "null", "null", "s_uart2", "null", "null", "null", "null", "null", "null", "null", "eint", "io_disabled"]
            },
        },
    },
    dramConfig: {
        chipName: 'V838/V861/V881',
        defaults: [
            1056,        // [0]  dram_clk
            3,           // [1]  dram_type (DDR3)
            0x7b6bfb,    // [2]  dram_zq
            0x1,         // [3]  dram_odt_en
            0x000010d2,  // [4]  dram_para1
            0x00000000,  // [5]  dram_para2
            0x1c70,      // [6]  dram_mr0
            0x2,         // [7]  dram_mr1
            0x18,        // [8]  dram_mr2
            0x0,         // [9]  dram_mr3
            0x004A2195,  // [10] dram_tpr0
            0x02423190,  // [11] dram_tpr1
            0x0008B061,  // [12] dram_tpr2
            0xB4787896,  // [13] dram_tpr3
            0x0,         // [14] dram_tpr4
            0x48484848,  // [15] dram_tpr5
            0x48,        // [16] dram_tpr6
            0x1621121e,  // [17] dram_tpr7
            0x0,         // [18] dram_tpr8
            0x0,         // [19] dram_tpr9
            0x0,         // [20] dram_tpr10
            0x00460000,  // [21] dram_tpr11
            0x00000055,  // [22] dram_tpr12
            0x34010100,  // [23] dram_tpr13
            0, 0, 0, 0, 0, 0, 0, 0  // [24-31] unused
        ],
        fields: [
            { index: 0, name: 'dram_clk', label: 'DRAM Clock', description: 'Clock frequency in MHz, data rate = clock × 2', type: 'number', min: 0, max: 1200, step: 12, unit: 'MHz' },
            {
                index: 1, name: 'dram_type', label: 'DRAM Type', description: 'DDR type: 2=DDR2, 3=DDR3, 6=LPDDR2, 7=LPDDR3',
                type: 'enum', options: [
                    { value: 2, label: 'DDR2' },
                    { value: 3, label: 'DDR3' },
                    { value: 6, label: 'LPDDR2' },
                    { value: 7, label: 'LPDDR3' },
                ]
            },
            {
                index: 2, name: 'dram_zq', label: 'DRAM ZQ', description: 'ODT and drive strength config',
                type: 'bitfield', bits: [
                    { name: 'ca_drive', label: 'CA Drive', offset: 0, width: 4 },
                    { name: 'ck_drive', label: 'CK Drive', offset: 4, width: 4 },
                    { name: 'dx_drive', label: 'DX Drive', offset: 8, width: 4 },
                    { name: 'dx_odt', label: 'DX ODT', offset: 12, width: 4 },
                ]
            },
            { index: 3, name: 'dram_odt_en', label: 'ODT Enable', description: 'DX read ODT enable (0=off, 1=on)', type: 'number', min: 0, max: 3 },
            {
                index: 4, name: 'dram_para1', label: 'DRAM Para1', description: 'Bank, row, page size config',
                type: 'bitfield', bits: [
                    {
                        name: 'page_size', label: 'Page Size', offset: 0, width: 4, options: [
                            { value: 0, label: '512B' }, { value: 1, label: '1KB' }, { value: 2, label: '2KB' },
                            { value: 4, label: '4KB' }, { value: 8, label: '8KB' },
                        ]
                    },
                    { name: 'row_number', label: 'Row Number', offset: 4, width: 8 },
                    {
                        name: 'bank_size', label: 'Bank Size', offset: 12, width: 4, options: [
                            { value: 0, label: '4 Banks' }, { value: 1, label: '8 Banks' },
                        ]
                    },
                ]
            },
            {
                index: 5, name: 'dram_para2', label: 'DRAM Para2', description: 'Capacity, rank, bus width config',
                type: 'bitfield', bits: [
                    {
                        name: 'bus_width', label: 'Bus Width', offset: 0, width: 4, options: [
                            { value: 0, label: '16bit' }, { value: 1, label: '8bit' },
                        ]
                    },
                    {
                        name: 'rank_number', label: 'Rank Number', offset: 12, width: 4, options: [
                            { value: 0, label: '1 Rank' }, { value: 1, label: '2 Ranks' },
                        ]
                    },
                    { name: 'dram_size', label: 'DRAM Size (MB)', offset: 16, width: 15 },
                    {
                        name: 'size_mode', label: 'Size Mode', offset: 31, width: 1, options: [
                            { value: 0, label: 'Auto' }, { value: 1, label: 'Manual' },
                        ]
                    },
                ]
            },
            { index: 6, name: 'dram_mr0', label: 'MR0', description: 'Mode Register 0', type: 'number', hex: true },
            { index: 7, name: 'dram_mr1', label: 'MR1', description: 'Mode Register 1', type: 'number', hex: true },
            { index: 8, name: 'dram_mr2', label: 'MR2', description: 'Mode Register 2', type: 'number', hex: true },
            { index: 9, name: 'dram_mr3', label: 'MR3', description: 'Mode Register 3', type: 'number', hex: true },
            { index: 10, name: 'dram_tpr0', label: 'TPR0', type: 'number', hex: true },
            { index: 11, name: 'dram_tpr1', label: 'TPR1', type: 'number', hex: true },
            { index: 12, name: 'dram_tpr2', label: 'TPR2', type: 'number', hex: true },
            { index: 13, name: 'dram_tpr3', label: 'TPR3', type: 'number', hex: true },
            { index: 14, name: 'dram_tpr4', label: 'TPR4', type: 'number', hex: true },
            { index: 15, name: 'dram_tpr5', label: 'TPR5', description: 'VREF config, do not modify', type: 'number', hex: true },
            { index: 16, name: 'dram_tpr6', label: 'TPR6', type: 'number', hex: true },
            { index: 17, name: 'dram_tpr7', label: 'TPR7', type: 'number', hex: true },
            { index: 18, name: 'dram_tpr8', label: 'TPR8', type: 'number', hex: true },
            { index: 19, name: 'dram_tpr9', label: 'TPR9', type: 'number', hex: true },
            {
                index: 20, name: 'dram_tpr10', label: 'TPR10', description: 'CK/CA/CS phase delay (0x0-0xF)',
                type: 'bitfield', bits: [
                    { name: 'ck_wr_delay', label: 'CK Write Delay', offset: 0, width: 4 },
                    { name: 'ca_wr_delay', label: 'CA Write Delay', offset: 4, width: 4 },
                    { name: 'cs0_wr_delay', label: 'CS0 Write Delay', offset: 8, width: 4 },
                    { name: 'cs1_wr_delay', label: 'CS1 Write Delay', offset: 12, width: 4 },
                ]
            },
            {
                index: 21, name: 'dram_tpr11', label: 'TPR11', description: 'DQS/DQ write phase delay (0x0-0xF)',
                type: 'bitfield', bits: [
                    { name: 'dx0_wr_delay', label: 'DX0 Write Delay', offset: 0, width: 4 },
                    { name: 'dx1_wr_delay', label: 'DX1 Write Delay', offset: 4, width: 4 },
                    { name: 'dqs0_wr_delay', label: 'DQS0 Write Delay', offset: 16, width: 4 },
                    { name: 'dqs1_wr_delay', label: 'DQS1 Write Delay', offset: 20, width: 4 },
                ]
            },
            {
                index: 22, name: 'dram_tpr12', label: 'TPR12', description: 'DQS/DQ read phase delay (0x0-0xF)',
                type: 'bitfield', bits: [
                    { name: 'dx0_rd_delay', label: 'DX0 Read Delay', offset: 0, width: 4 },
                    { name: 'dx1_rd_delay', label: 'DX1 Read Delay', offset: 4, width: 4 },
                    { name: 'dqs0_rd_delay', label: 'DQS0 Read Delay', offset: 16, width: 4 },
                    { name: 'dqs1_rd_delay', label: 'DQS1 Read Delay', offset: 20, width: 4 },
                ]
            },
            { index: 23, name: 'dram_tpr13', label: 'TPR13', description: 'Flexible control, project-specific', type: 'number', hex: true },
        ],
    }
};