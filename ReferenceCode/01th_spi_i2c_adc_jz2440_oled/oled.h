
#ifndef _OLED_H
#define  _OLED_H
#include "stm32f1xx_hal.h"

void OLEDInit(void);
void OLEDPrint(int page, int col, char *str);
void OLEDPutChar(int page, int col, char c);

#endif

