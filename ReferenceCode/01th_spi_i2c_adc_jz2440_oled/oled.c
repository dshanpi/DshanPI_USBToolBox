#include "oledfont.h"
#include "oled.h"
#include "main.h"

static void OLED_Set_DC(char val)
{
    if (val)
        HAL_GPIO_WritePin(DC_GPIO_Port,DC_Pin,GPIO_PIN_SET);
    else
        HAL_GPIO_WritePin(DC_GPIO_Port,DC_Pin,GPIO_PIN_RESET);
}
static void SPI_Set_CLK(char val)
{
    if (val)
        HAL_GPIO_WritePin(CLK_GPIO_Port,CLK_Pin,GPIO_PIN_SET);
    else
        HAL_GPIO_WritePin(CLK_GPIO_Port,CLK_Pin,GPIO_PIN_RESET);
}

static void SPI_Set_DO(char val)
{
    if (val)
        HAL_GPIO_WritePin(MOSI_GPIO_Port,MOSI_Pin,GPIO_PIN_SET);
    else
        HAL_GPIO_WritePin(MOSI_GPIO_Port,MOSI_Pin,GPIO_PIN_RESET);
}

void SPISendByte(unsigned char val)
{
    int i;
    for (i = 0; i < 8; i++)
    {
        SPI_Set_CLK(0);
        SPI_Set_DO(val & 0x80);
        SPI_Set_CLK(1);
        val <<= 1;
    }
    
}
static void OLED_Set_CS(char val)
{
    if (val)
        HAL_GPIO_WritePin(CS_GPIO_Port,CS_Pin,GPIO_PIN_SET);
    else
        HAL_GPIO_WritePin(CS_GPIO_Port,CS_Pin,GPIO_PIN_RESET);
}

static void OLEDWriteCmd(unsigned char cmd)
{
    OLED_Set_DC(0); /* command */
    OLED_Set_CS(0); /* select OLED */

    SPISendByte(cmd);

    OLED_Set_CS(1); /* de-select OLED */
    OLED_Set_DC(1); /*  */
}

static void OLEDWriteDat(unsigned char dat)
{
    OLED_Set_DC(1); /* data */
    OLED_Set_CS(0); /* select OLED */

    SPISendByte(dat);

    OLED_Set_CS(1); /* de-select OLED */
    OLED_Set_DC(1); /*  */
}

static void OLEDSetPageAddrMode(void)
{
    OLEDWriteCmd(0x20);
    OLEDWriteCmd(0x02);
}

static void OLEDSetPos(int page, int col)
{
    OLEDWriteCmd(0xB0 + page); /* page address */

    OLEDWriteCmd(col & 0xf);   /* Lower Column Start Address */
    OLEDWriteCmd(0x10 + (col >> 4));   /* Lower Higher Start Address */
}


static void OLEDClear(void)
{
    int page, i;
    for (page = 0; page < 8; page ++)
    {
        OLEDSetPos(page, 0);
        for (i = 0; i < 128; i++)
            OLEDWriteDat(0);
    }
}

void OLEDInit(void)
{
    /* 向OLED发命令以初始化 */
    OLEDWriteCmd(0xAE); /*display off*/ 
    OLEDWriteCmd(0x00); /*set lower column address*/ 
    OLEDWriteCmd(0x10); /*set higher column address*/ 
    OLEDWriteCmd(0x40); /*set display start line*/ 
    OLEDWriteCmd(0xB0); /*set page address*/ 
    OLEDWriteCmd(0x81); /*contract control*/ 
    OLEDWriteCmd(0x66); /*128*/ 
    OLEDWriteCmd(0xA1); /*set segment remap*/ 
    OLEDWriteCmd(0xA6); /*normal / reverse*/ 
    OLEDWriteCmd(0xA8); /*multiplex ratio*/ 
    OLEDWriteCmd(0x3F); /*duty = 1/64*/ 
    OLEDWriteCmd(0xC8); /*Com scan direction*/ 
    OLEDWriteCmd(0xD3); /*set display offset*/ 
    OLEDWriteCmd(0x00); 
    OLEDWriteCmd(0xD5); /*set osc division*/ 
    OLEDWriteCmd(0x80); 
    OLEDWriteCmd(0xD9); /*set pre-charge period*/ 
    OLEDWriteCmd(0x1f); 
    OLEDWriteCmd(0xDA); /*set COM pins*/ 
    OLEDWriteCmd(0x12); 
    OLEDWriteCmd(0xdb); /*set vcomh*/ 
    OLEDWriteCmd(0x30); 
    OLEDWriteCmd(0x8d); /*set charge pump enable*/ 
    OLEDWriteCmd(0x14); 

    OLEDSetPageAddrMode();

    OLEDClear();
    
    OLEDWriteCmd(0xAF); /*display ON*/    
}


/* page: 0-7
 * col : 0-127
 * 字符: 8x16象素
 */
void OLEDPutChar(int page, int col, char c)
{
    int i = 0;
    /* 得到字模 */
    const unsigned char *dots = oled_asc2_8x16[c - ' '];

    /* 发给OLED */
    OLEDSetPos(page, col);
    /* 发出8字节数据 */
    for (i = 0; i < 8; i++)
        OLEDWriteDat(dots[i]);

    OLEDSetPos(page+1, col);
    /* 发出8字节数据 */
    for (i = 0; i < 8; i++)
        OLEDWriteDat(dots[i+8]);

}


/* page: 0-7
 * col : 0-127
 * 字符: 8x16象素
 */
void OLEDPrint(int page, int col, char *str)
{
    int i = 0;
    while (str[i])
    {
        OLEDPutChar(page, col, str[i]);
        col += 8;
        if (col > 127)
        {
            col = 0;
            page += 2;
        }
        i++;
    }
}


