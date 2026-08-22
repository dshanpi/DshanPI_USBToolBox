#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <fcntl.h>
#include <string.h>

#include <sys/ioctl.h>
#include <sys/types.h>
#include <sys/stat.h>

#include <linux/types.h>
#include <linux/spi/spidev.h>

#include "font.h"

//为0 表示命令，为1表示数据
#define OLED_CMD 	0
#define OLED_DATA 	1

static int fd_spidev;
static int dc_pin_num;

void OLED_DIsp_Set_Pos(int x, int y);


void dc_pin_init(int number)
{
	// echo 509 > /sys/class/gpio/export
	// echo out > /sys/class/gpio/gpio509/direction	

	char cmd[100];

	dc_pin_num = number;

	sprintf(cmd, "echo %d > /sys/class/gpio/export", number);
	system(cmd);

	sprintf(cmd, "echo out > /sys/class/gpio/gpio%d/direction", number);
	system(cmd);	
}

void oled_set_dc_pin(int val)
{
	/* echo 1 > /sys/class/gpio/gpio509/value
	 * echo 0 > /sys/class/gpio/gpio509/value
	 */
	char cmd[100];
	sprintf(cmd, "echo %d > /sys/class/gpio/gpio%d/value", val, dc_pin_num);
	system(cmd);	
}

void spi_write_datas(const unsigned char *buf, int len)
{
	write(fd_spidev, buf, len);
}

void oled_write_datas(const unsigned char *buf, int len)
{
	oled_set_dc_pin(1);//拉高，表示写入数据
	spi_write_datas(buf, len);
}

		  			 		  						  					  				 	   		  	  	 	  
/**********************************************************************
	 * 函数名称： oled_write_cmd
	 * 功能描述： oled向特定地址写入数据或者命令
	 * 输入参数：@uc_data :要写入的数据
	 			@uc_cmd:为1则表示写入数据，为0表示写入命令
	 * 输出参数：无
	 * 返 回 值： 无
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/04		 V1.0	  芯晓		  创建
 ***********************************************************************/
void oled_write_cmd_data(unsigned char uc_data,unsigned char uc_cmd)
{
	unsigned char uc_read=0;
	if(uc_cmd==0)
	{
		oled_set_dc_pin(0);
	}
	else
	{
		oled_set_dc_pin(1);//拉高，表示写入数据
	}
	spi_write_datas(&uc_data, 1);//写入
}
/**********************************************************************
	 * 函数名称： oled_init
	 * 功能描述： oled_init的初始化，包括SPI控制器得初始化
	 * 输入参数：无
	 * 输出参数： 初始化的结果
	 * 返 回 值： 成功则返回0，否则返回-1
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
int oled_init(void)
{
	unsigned char uc_dev_id = 0;
		  			 		  						  					  				 	   		  	  	 	  
	oled_write_cmd_data(0xae,OLED_CMD);//关闭显示

	oled_write_cmd_data(0x00,OLED_CMD);//设置 lower column address
	oled_write_cmd_data(0x10,OLED_CMD);//设置 higher column address

	oled_write_cmd_data(0x40,OLED_CMD);//设置 display start line

	oled_write_cmd_data(0xB0,OLED_CMD);//设置page address

	oled_write_cmd_data(0x81,OLED_CMD);// contract control
	oled_write_cmd_data(0xcf,OLED_CMD);//128 , 屏幕较暗的话 0x66 ==> 0xcf

	oled_write_cmd_data(0xa1,OLED_CMD);//设置 segment remap

	oled_write_cmd_data(0xa6,OLED_CMD);//normal /reverse

	oled_write_cmd_data(0xa8,OLED_CMD);//multiple ratio
	oled_write_cmd_data(0x3f,OLED_CMD);//duty = 1/64

	oled_write_cmd_data(0xc8,OLED_CMD);//com scan direction

	oled_write_cmd_data(0xd3,OLED_CMD);//set displat offset
	oled_write_cmd_data(0x00,OLED_CMD);//

	oled_write_cmd_data(0xd5,OLED_CMD);//set osc division
	oled_write_cmd_data(0x80,OLED_CMD);//

	oled_write_cmd_data(0xd9,OLED_CMD);//ser pre-charge period
	oled_write_cmd_data(0xf1,OLED_CMD);// 屏幕较暗的话 0x1f ==> 0xf1

	oled_write_cmd_data(0xda,OLED_CMD);//set com pins
	oled_write_cmd_data(0x12,OLED_CMD);//

	oled_write_cmd_data(0xdb,OLED_CMD);//set vcomh
	oled_write_cmd_data(0x30,OLED_CMD);//

	oled_write_cmd_data(0x8d,OLED_CMD);//set charge pump disable 
	oled_write_cmd_data(0x14,OLED_CMD);//

	oled_write_cmd_data(0xaf,OLED_CMD);//set dispkay on

	return 0;
}		  			 		  						  					  				 	   		  	  	 	  
/**********************************************************************
	 * 函数名称： oled_fill_data
	 * 功能描述： 整个屏幕显示填充某个固定数据
	 * 输入参数：@fill_Data：要填充的数据
	 * 输出参数： 填充结果
	 * 返 回 值： 成功则返回0
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
int oled_fill_data(unsigned char fill_Data)
{
	unsigned char x,y;
	for(x=0;x<8;x++)
	{
	
		oled_write_cmd_data(0xb0+x,OLED_CMD);		//page0-page1
		oled_write_cmd_data(0x00,OLED_CMD);		//low column start address
		oled_write_cmd_data(0x10,OLED_CMD);		//high column start address	
		for(y=0;y<128;y++)
		{
			oled_write_cmd_data(fill_Data,OLED_DATA);//填充数据
		}				
	}
	return 0;
}
/**********************************************************************
	 * 函数名称： OLED_DIsp_Clear
	 * 功能描述： 整个屏幕显示数据清0
	 * 输入参数：无
	 * 输出参数： 无
	 * 返 回 值： 
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
void OLED_DIsp_Clear(void)  
{
    unsigned char x, y;
	char buf[128];

	memset(buf, 0, 128);
	
    for (y = 0; y < 8; y++)
    {
        OLED_DIsp_Set_Pos(0, y);
        //for (x = 0; x < 128; x++)
        //    oled_write_cmd_data(0, OLED_DATA); /* 清零 */
        oled_write_datas(buf, 128);
    }
}

/**********************************************************************
	 * 函数名称： OLED_DIsp_All
	 * 功能描述： 整个屏幕显示全部点亮，可以用于检查坏点
	 * 输入参数：无
	 * 输出参数：无 
	 * 返 回 值：
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
void OLED_DIsp_All(void)  
{
	unsigned char x, y;
	for (y = 0; y < 8; y++)
	{
		OLED_DIsp_Set_Pos(0, y);
		for (x = 0; x < 128; x++)
			oled_write_cmd_data(0xff, OLED_DATA); /* 全点亮 */
	}
}

//坐标设置
/**********************************************************************
	 * 函数名称： OLED_DIsp_Set_Pos
	 * 功能描述：设置要显示的位置
	 * 输入参数：@ x ：要显示的column address
	 			@y :要显示的page address
	 * 输出参数： 无
	 * 返 回 值： 
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
void OLED_DIsp_Set_Pos(int x, int y)
{ 	oled_write_cmd_data(0xb0+y,OLED_CMD);
	oled_write_cmd_data((x&0x0f),OLED_CMD); 
	oled_write_cmd_data(((x&0xf0)>>4)|0x10,OLED_CMD);
}   	      	   			 
/**********************************************************************
	  * 函数名称： OLED_DIsp_Char
	  * 功能描述：在某个位置显示字符 1-9
	  * 输入参数：@ x ：要显示的column address
		 			@y :要显示的page address
		 			@c ：要显示的字符的ascii码
	  * 输出参数： 无
	  * 返 回 值： 
	  * 修改日期		版本号	  修改人 	   修改内容
	  * -----------------------------------------------
	  * 2020/03/15		  V1.0	   芯晓		   创建
***********************************************************************/
void OLED_DIsp_Char(int x, int y, unsigned char c)
{
	int i = 0;
	/* 得到字模 */
	const unsigned char *dots = oled_asc2_8x16[c - ' '];

	/* 发给OLED */
	OLED_DIsp_Set_Pos(x, y);
	/* 发出8字节数据 */
	//for (i = 0; i < 8; i++)
	//	oled_write_cmd_data(dots[i], OLED_DATA);
	oled_write_datas(&dots[0], 8);

	OLED_DIsp_Set_Pos(x, y+1);
	/* 发出8字节数据 */
	//for (i = 0; i < 8; i++)
		//oled_write_cmd_data(dots[i+8], OLED_DATA);
	oled_write_datas(&dots[8], 8);
}


/**********************************************************************
	 * 函数名称： OLED_DIsp_String
	 * 功能描述： 在指定位置显示字符串
	 * 输入参数：@ x ：要显示的column address
		 			@y :要显示的page address
		 			@str ：要显示的字符串
	 * 输出参数： 无
	 * 返 回 值： 无
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
***********************************************************************/
void OLED_DIsp_String(int x, int y, char *str)
{
	unsigned char j=0;
	while (str[j])
	{		
		OLED_DIsp_Char(x, y, str[j]);//显示单个字符
		x += 8;
		if(x > 127)
		{
			x = 0;
			y += 2;
		}//移动显示位置
		j++;
	}
}
/**********************************************************************
	 * 函数名称： OLED_DIsp_CHinese
	 * 功能描述：在指定位置显示汉字
	 * 输入参数：@ x ：要显示的column address
		 			@y :要显示的page address
		 			@chr ：要显示的汉字，三个汉字“百问网”中选择一个
	 * 输出参数： 无
	 * 返 回 值： 无
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/

void OLED_DIsp_CHinese(unsigned char x,unsigned char y,unsigned char no)
{      			    
	unsigned char t,adder=0;
	OLED_DIsp_Set_Pos(x,y);	
    for(t=0;t<16;t++)
	{//显示上半截字符	
		oled_write_cmd_data(hz_1616[no][t*2],OLED_DATA);
		adder+=1;
    }	
	OLED_DIsp_Set_Pos(x,y+1);	
    for(t=0;t<16;t++)
	{//显示下半截字符
		oled_write_cmd_data(hz_1616[no][t*2+1],OLED_DATA);
		adder+=1;
    }					
}
/**********************************************************************
	 * 函数名称： OLED_DIsp_Test
	 * 功能描述： 整个屏幕显示测试
	 * 输入参数：无
	 * 输出参数： 无
	 * 返 回 值： 无
	 * 修改日期 	   版本号	 修改人		  修改内容
	 * -----------------------------------------------
	 * 2020/03/15		 V1.0	  芯晓		  创建
 ***********************************************************************/
void OLED_DIsp_Test(void)
{ 	
	int i;
	
	OLED_DIsp_String(0, 0, "wiki.100ask.net");
	OLED_DIsp_String(0, 2, "book.100ask.net");
	OLED_DIsp_String(0, 4, "bbs.100ask.net");
	
	for(i = 0; i < 3; i++)
	{   //显示汉字 百问网
		OLED_DIsp_CHinese(32+i*16, 6, i);
	}
} 

/* spi_oled /dev/spidevB.D <DC_pin_number> */
int main(int argc, char **argv)
{
	int dc_pin;
	
	if (argc != 3)
	{
		printf("Usage: %s <dev/spidevB.D> <DC_pin_number>\n", argv[0]);
		return -1;
	}

	fd_spidev = open(argv[1], O_RDWR);
	if (fd_spidev < 0) {
		printf("open %s err\n", argv[1]);
		return -1;
	}

	dc_pin = strtoul(argv[2], NULL, 0);
	dc_pin_init(dc_pin);

	oled_init();

	OLED_DIsp_Clear();
	
	OLED_DIsp_Test();

	return 0;
}

