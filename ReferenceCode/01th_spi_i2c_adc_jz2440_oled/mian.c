void TEST(void)
{
    OLEDInit();
    while(1){
        OLEDPrint(0,0,"www.100ask.net, 100ask.taobao.com");
		HAL_Delay(1000);
    }
}

