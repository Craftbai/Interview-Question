/* 分类元数据。新增分类时：这里登记 + 在 index.html 里加 <script>。 */
QBANK.setCategories([
  { id: 'c-lang',     name: 'C 语言核心',    desc: '指针、限定符、内存分区、对齐、位运算——面试第一关，几乎必问' },
  { id: 'coding',     name: '手撕代码',       desc: '现场写代码：strcpy/memcpy、链表、环形缓冲、协议解析、位运算' },
  { id: 'cpp',        name: 'C++ 与 OOP',    desc: '虚函数、RAII、C++11；Qt 与上位机；嵌入式场景下的取舍' },
  { id: 'ds-algo',    name: '数据结构与算法', desc: '偏嵌入式常用：环形缓冲、链表、位图、查表' },
  { id: 'control',    name: '控制与信号处理', desc: 'PID、采样定理、传递函数、电机控制、编码器、滤波与 FFT' },
  { id: 'os',         name: '操作系统原理',   desc: '进程线程、调度、同步、虚拟内存、中断上下文' },
  { id: 'rtos',       name: 'RTOS / FreeRTOS', desc: '任务调度、优先级反转、同步原语、栈与堆' },
  { id: 'linux-app',  name: '嵌入式 Linux 应用', desc: '系统调用、IPC、多线程、IO 多路复用、交叉编译' },
  { id: 'linux-drv',  name: 'Linux 驱动与内核', desc: '字符设备、设备树、平台总线、中断上下半部' },
  { id: 'mcu-hw',     name: 'MCU 与硬件',     desc: '启动流程、时钟、中断、DMA、低功耗、Cache 与 MPU' },
  { id: 'hardware',   name: '电路与硬件基础', desc: '三极管/MOS 开关、上下拉、电平转换、运放、电源、ESD 与 EMC' },
  { id: 'bus',        name: '总线与通信接口', desc: 'UART / I2C / SPI / CAN / RS485 的原理与调试' },
  { id: 'network',    name: '网络协议与编程', desc: 'TCP/UDP、粘包、socket、epoll、HTTP、MQTT' },
  { id: 'build',      name: '编译链接与内存布局', desc: '四阶段、段分布、链接脚本、map 文件、库' },
  { id: 'tools',      name: '工程工具与协作', desc: 'Git、Linux 命令行、Python 测试脚本、CI、代码评审' },
  { id: 'debug',      name: '调试与问题定位', desc: 'HardFault、栈溢出、内存泄漏、抓总线、gdb' },
  { id: 'security',   name: '信息安全',       desc: '哈希、签名验签、安全启动、密钥保护' },
  { id: 'automotive', name: '汽车电子专题',   desc: 'CAN、ISO-TP、UDS、Bootloader 刷写、AUTOSAR、功能安全' },
  { id: 'behavioral', name: '项目与行为面',   desc: '自我介绍、STAR、项目深挖、反问' }
]);

/* 筛选面板的「车载方向」预设 */
window.CAT_PRESETS = {
  automotive: ['automotive', 'bus', 'security', 'mcu-hw', 'hardware', 'build', 'debug', 'behavioral']
};
