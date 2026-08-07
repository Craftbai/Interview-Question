QBANK.add([
{
  id: 'c-001', cat: 'c-lang', type: 'qa', level: 1, tags: ['volatile'],
  q: 'volatile 关键字的作用是什么？在嵌入式里哪些变量必须加 volatile？',
  a: 'volatile 告诉编译器：这个变量可能被当前控制流以外的因素改变，**每次访问都必须真的去内存读写，不许做寄存器缓存、不许合并或删除访问**。\n\n必须加的三类场景：\n- **内存映射的硬件寄存器**。状态寄存器的值由外设改，编译器不知道，不加 volatile 会把 `while(!(REG & FLAG));` 优化成死循环。\n- **中断服务程序（ISR）与主循环共享的全局变量**。主循环里读的标志位是被 ISR 改的。\n- **多线程/多任务共享的变量**（但 volatile 不保证原子性和内存序，真正的并发同步要靠锁或原子操作）。\n\n必须说清的边界：**volatile 只解决"可见性"，不解决"原子性"**。`volatile int x; x++;` 依然是读-改-写三步，中断照样能插进来。',
  followup: ['volatile 能替代锁吗？为什么不能？', 'volatile 和 const 能同时用吗？什么场景？', '编译器优化把你的等待循环优化掉了，除了 volatile 还有什么现象能帮你确认？']
},
{
  id: 'c-002', cat: 'c-lang', type: 'qa', level: 1, tags: ['static'],
  q: 'static 在 C 语言里有哪几种用法？分别改变了什么？',
  a: '三种用法，改变的是**存储期**和**链接属性**两件事：\n\n- **修饰局部变量**：存储期从"自动"变成"静态"，变量放到 .data/.bss 段，函数退出不销毁，下次进来还是上次的值。只初始化一次。作用域不变，仍然只在函数内可见。\n- **修饰全局变量**：链接属性从"外部链接"变成"内部链接"，只在本 .c 文件可见，别的文件 extern 不到。用来避免全局符号污染和重名冲突。\n- **修饰函数**：同上，函数只在本文件可见，相当于模块私有函数。\n\n嵌入式里第三条特别常用：驱动文件里除了对外的几个接口，其余全部 static，既防止符号冲突，也给编译器更大的优化空间（能确定没有外部调用者）。',
  followup: ['static 局部变量存在哪个段？初始化为 0 和初始化为 5 分别在哪？', '多个 .c 文件里都定义了 static int count; 会冲突吗？']
},
{
  id: 'c-003', cat: 'c-lang', type: 'single', level: 2, tags: ['const', '指针'],
  q: '下面四个声明，哪一个表示"指针本身不能改，但指向的内容可以改"？',
  options: [
    'const int *p;',
    'int const *p;',
    'int * const p;',
    'const int * const p;'
  ],
  answer: [2],
  a: '看 const 相对 `*` 的位置：**const 在 `*` 左边修饰的是指向的数据，在 `*` 右边修饰的是指针本身**。\n\n- `const int *p` 和 `int const *p` 完全等价：指向的内容只读，`*p = 1` 非法，`p = &x` 合法。\n- `int * const p`：指针是常量，`p = &x` 非法，`*p = 1` 合法。必须定义时初始化。\n- `const int * const p`：两者都不能改。\n\n口诀是从右往左读：`int * const p` 读作 "p is a const pointer to int"。',
  followup: ['函数参数写成 const char *str 有什么好处？', 'const 修饰的全局变量在嵌入式里通常被链接到哪个段？']
},
{
  id: 'c-004', cat: 'c-lang', type: 'qa', level: 1, tags: ['内存分区'],
  q: '一个 C 程序在内存里分成哪几个区？各放什么？',
  a: '- **.text（代码段）**：机器指令，只读。MCU 上直接位于 Flash。\n- **.rodata（只读数据）**：字符串字面量、const 全局量。\n- **.data（已初始化数据）**：初值非 0 的全局变量和 static 变量。**在 MCU 上它的初值存在 Flash，启动代码负责搬到 RAM**。\n- **.bss（未初始化数据）**：初值为 0 或未给初值的全局/static 变量。不占 Flash 空间，启动时由启动代码清零。\n- **堆（heap）**：malloc/free 管理，从低地址往高地址长。\n- **栈（stack）**：局部变量、函数参数、返回地址、现场保护，通常从高地址往低地址长。\n\n嵌入式面试常追的一句：**.data 占 Flash 也占 RAM，.bss 只占 RAM**。所以把大数组初始化成 0 而不是别的值，能省 Flash。',
  followup: ['为什么 .bss 不占 Flash？', '启动文件里那段搬运 .data、清零 .bss 的代码叫什么？', '栈和堆相遇会怎样？怎么检测？']
},
{
  id: 'c-005', cat: 'c-lang', type: 'single', level: 2, tags: ['结构体', '对齐'],
  q: '32 位平台（默认对齐），下面结构体 sizeof 是多少？\n\n```c\nstruct S {\n    char  a;\n    int   b;\n    char  c;\n    short d;\n};\n```',
  options: ['8', '10', '12', '16'],
  answer: [2],
  a: '**12 字节**。逐个排：\n\n- `a` 占 offset 0，1 字节。\n- `b` 要求 4 字节对齐，offset 1~3 填充 3 字节，`b` 落在 offset 4，占 4 字节（到 7）。\n- `c` 在 offset 8，1 字节。\n- `d` 要求 2 字节对齐，offset 9 不满足，填充 1 字节，`d` 落在 offset 10，占 2 字节（到 11）。\n- 结构体整体要按最大成员对齐数（4）取整，12 已经是 4 的倍数，**尾部无需再补**。\n\n合计 12。\n\n把成员按**从大到小**重排成 `int b; short d; char a; char c;` 只要 8 字节——这是嵌入式里省 RAM 的常用手段。',
  followup: ['为什么要内存对齐？不对齐会怎样？', '#pragma pack(1) 之后 sizeof 是多少？有什么风险？', '协议报文结构体为什么不能直接内存拷贝到总线上？']
},
{
  id: 'c-006', cat: 'c-lang', type: 'qa', level: 2, tags: ['对齐', '协议'],
  q: '为什么需要内存对齐？强行 #pragma pack(1) 会带来什么问题？',
  a: '**为什么对齐**：CPU 访问内存是按总线宽度成块读的。一个 4 字节的 int 如果跨了两个 4 字节块，硬件就得读两次再拼接。x86 会自动处理但变慢；**很多 ARM/RISC 核在非对齐访问时直接触发 Fault**。\n\n**pack(1) 的代价**：\n- 性能下降，每次访问可能拆成多次。\n- 在不支持非对齐访问的核上直接 HardFault / Bus Fault。\n- 编译器无法再用 LDM/STM 这类批量指令。\n\n**正确用法**：pack(1) 只用于"描述外部字节流布局"的结构体（协议报文、Flash 里的存储结构），而且**不要直接对它的成员做算术访问，先 memcpy 到一个对齐的局部变量再用**。这条是踩过坑才知道的。',
  followup: ['跨编译器时 #pragma pack 和 __attribute__((packed)) 有什么区别？', '协议结构体除了对齐，还有什么跨平台隐患？（提示：字节序、位域顺序）'],
},
{
  id: 'c-007', cat: 'c-lang', type: 'qa', level: 2, tags: ['字节序'],
  q: '什么是大端小端？写一段代码判断当前平台的字节序。',
  a: '**大端（Big-Endian）**：高位字节存在低地址。网络字节序、很多 MCU（如部分 PowerPC、TriCore 可配置）用大端。\n**小端（Little-Endian）**：低位字节存在低地址。x86、绝大多数 ARM 默认小端。\n\n判断方法一，用 union：\n\n```c\nint is_little_endian(void)\n{\n    union { uint16_t v; uint8_t b[2]; } u = { .v = 0x0102 };\n    return u.b[0] == 0x02;   /* 低地址放低位 -> 小端 */\n}\n```\n\n方法二，指针强转：\n\n```c\nint is_little_endian2(void)\n{\n    uint16_t v = 0x0102;\n    return *(uint8_t *)&v == 0x02;\n}\n```\n\n**为什么重要**：跨设备传数据（CAN、以太网、串口协议）时两端字节序不一致，收到的整数就是错的。协议里必须明确规定字节序，代码里用 htons/htonl 或自己写的转换宏统一。',
  followup: ['CAN 报文里的 Motorola 格式和 Intel 格式对应大端还是小端？', '结构体里的位域顺序在大小端平台上一致吗？'],
},
{
  id: 'c-008', cat: 'c-lang', type: 'single', level: 2, tags: ['指针', '数组'],
  q: '下面代码在 32 位平台输出什么？\n\n```c\nint a[5] = {1,2,3,4,5};\nint *p1 = (int *)(&a + 1);\nint *p2 = (int *)((int)a + 1);\nprintf("%d ", *(p1 - 1));\n```',
  options: ['1', '5', '2', '未定义'],
  answer: [1],
  a: '输出 **5**。\n\n关键在 `&a` 的类型是 `int (*)[5]`，**指向整个数组**，所以 `&a + 1` 跨过 20 字节，指到数组末尾之后。强转成 `int *` 再减 1，就退回到最后一个元素 `a[4]`，值是 5。\n\n对比 `a` 本身在表达式里退化成 `int *`（指向首元素），`a + 1` 只跨 4 字节指向 `a[1]`。\n\n这题考的是 **`a` 和 `&a` 类型不同**：值相同，但指针算术的步长差了 5 倍。（题里的 `p2` 是把地址当整数加 1，得到未对齐地址，属于危险写法，实际项目别这么写。）',
  followup: ['sizeof(a) 和 sizeof(&a) 分别是多少？', '数组作为函数参数传递时发生了什么？函数里还能 sizeof 出数组大小吗？']
},
{
  id: 'c-009', cat: 'c-lang', type: 'single', level: 1, tags: ['sizeof', 'strlen'],
  q: '`char str[] = "hello";` 那么 sizeof(str) 和 strlen(str) 分别是？',
  options: ['5 和 5', '6 和 5', '5 和 6', '6 和 6'],
  answer: [1],
  a: '**sizeof(str) = 6，strlen(str) = 5**。\n\n- `sizeof` 是编译期运算符，算的是**数组占用的字节数**，包含结尾的 `\\0`，所以是 6。\n- `strlen` 是运行期函数，从首地址往后数到 `\\0` 为止，**不含 `\\0`**，所以是 5。\n\n陷阱变体：如果写成 `char *str = "hello";`，那么 `sizeof(str)` 是**指针的大小**（32 位平台 4，64 位 8），跟字符串长度没关系。数组名传进函数后也会退化成指针，函数里 sizeof 同样失效。',
  followup: ['char str[] = "hello" 和 char *str = "hello" 存储位置有什么区别？哪个能改？']
},
{
  id: 'c-010', cat: 'c-lang', type: 'bool', level: 1, tags: ['字符串', 'UB'],
  q: '`char *p = "hello"; p[0] = \'H\';` 这段代码可以正常运行。',
  answer: false,
  a: '**错误**。这是未定义行为。\n\n字符串字面量 `"hello"` 存放在 **.rodata 只读段**，`p` 只是指向它。往只读段写：\n- 在 Linux 上触发段错误（SIGSEGV）；\n- 在 MCU 上，.rodata 在 Flash 里，写操作要么被忽略、要么触发总线错误。\n\n想要可修改的字符串必须写成数组：`char p[] = "hello";`——这时编译器会把字符串**拷贝一份到栈上**，改的是这份副本。\n\n这也是为什么现代编译器建议 `const char *p = "hello";`，让编译器在编译期就拦住误写。',
  followup: ['这两种写法在 sizeof 上有什么区别？', '函数返回 char* 指向局部数组，会出什么问题？']
},
{
  id: 'c-011', cat: 'c-lang', type: 'qa', level: 2, tags: ['宏', 'inline'],
  q: '宏定义和 inline 函数有什么区别？各自适合什么场景？',
  a: '**宏是预处理阶段的文本替换**，inline 是编译阶段的函数内联建议。\n\n| | 宏 | inline 函数 |\n|---|---|---|\n| 处理阶段 | 预处理，纯文本替换 | 编译，有完整语义 |\n| 类型检查 | 无 | 有 |\n| 调试 | 断不了点，展开后难看 | 可调试、可查看符号 |\n| 副作用 | 参数可能被求值多次 | 参数只求值一次 |\n| 是否一定展开 | 一定 | 只是建议，编译器可拒绝 |\n\n**宏的经典坑**：\n```c\n#define SQUARE(x) ((x)*(x))\nint i = 3;\nSQUARE(i++);   /* 展开成 ((i++)*(i++))，i 被自增两次，UB */\n```\n还有不加括号的坑：`#define ADD(a,b) a+b`，`ADD(1,2)*3` 变成 `1+2*3 = 7`。所以**宏的参数和整体都要加括号**。\n\n**选择**：能用 inline 就用 inline；宏留给需要"操作类型本身"或"拼接符号"的场景（`#`、`##`、offsetof、条件编译）。',
  followup: ['写一个安全的 MAX 宏，避免参数多次求值（提示：GCC 的语句表达式）', 'C99 的 inline 和 C++ 的 inline 语义一样吗？']
},
{
  id: 'c-012', cat: 'c-lang', type: 'qa', level: 3, tags: ['宏', 'container_of'],
  q: '解释一下 Linux 内核里的 container_of 宏是怎么工作的。',
  a: '作用是：**已知结构体某个成员的地址，反推出结构体本身的首地址**。\n\n```c\n#define offsetof(TYPE, MEMBER) ((size_t)&((TYPE *)0)->MEMBER)\n\n#define container_of(ptr, type, member) ({          \\\n    const typeof(((type *)0)->member) *__mptr = (ptr); \\\n    (type *)((char *)__mptr - offsetof(type, member)); })\n```\n\n拆开看：\n1. `offsetof`：把 0 当作结构体首地址，那么成员的地址在数值上就等于它的偏移量。这里只做地址计算、不解引用，所以不会真的访问 0 地址。\n2. `container_of`：把成员指针**转成 char\\*（保证按字节退）**，减去偏移量，就落回结构体开头，再转成目标类型。\n3. 中间那个 `__mptr` 临时变量用 typeof 声明，作用是**做一次类型检查**——如果传进来的 ptr 类型和 member 类型对不上，编译器会警告。\n\n典型用途：链表节点内嵌在业务结构体里，遍历时拿到的是链表节点指针，需要还原出业务结构体。',
  followup: ['为什么要转成 char* 再做减法，直接用 type* 减不行吗？', '((TYPE *)0)->MEMBER 会不会真的解引用空指针？为什么不会崩？']
},
{
  id: 'c-013', cat: 'c-lang', type: 'qa', level: 2, tags: ['位运算'],
  q: '写出对寄存器某一位置位、清零、翻转、读取的标准写法。',
  a: '设 `REG` 是寄存器，`n` 是位号（从 0 开始）：\n\n```c\n#define BIT(n)          (1UL << (n))\n\n#define SET_BIT(R, n)   ((R) |=  BIT(n))     /* 置 1 */\n#define CLR_BIT(R, n)   ((R) &= ~BIT(n))     /* 清 0 */\n#define TOG_BIT(R, n)   ((R) ^=  BIT(n))     /* 翻转 */\n#define GET_BIT(R, n)   (((R) >> (n)) & 1UL) /* 读，结果规整为 0/1 */\n```\n\n几个容易被追问的细节：\n- **用 `1UL` 而不是 `1`**：`1` 是 int，`1 << 31` 在 32 位 int 上是有符号溢出（UB）。移位超过 31 位更是直接 UB。\n- **`~BIT(n)` 的类型**：如果寄存器是 uint32_t，`~` 之后要保证宽度一致，必要时显式写 `(uint32_t)~BIT(n)`。\n- **对硬件寄存器做读-改-写有并发风险**：中断里也改同一个寄存器就会丢更新。所以很多 MCU 提供 BSRR 这类"写 1 生效、写 0 无效"的原子置位寄存器，优先用它。',
  followup: ['为什么 STM32 的 GPIO 有 BSRR 寄存器？它解决了什么问题？', '怎么一次性把第 4~7 位设成某个值？（提示：先掩码清零再或上去）']
},
{
  id: 'c-014', cat: 'c-lang', type: 'qa', level: 2, tags: ['位运算', '算法'],
  q: '如何统计一个 32 位整数二进制中 1 的个数？给出两种方法并比较。',
  a: '**方法一：逐位移位**，固定 32 次循环。\n```c\nint count1(uint32_t x) {\n    int n = 0;\n    while (x) { n += x & 1; x >>= 1; }\n    return n;\n}\n```\n\n**方法二：Brian Kernighan 算法**，循环次数等于 1 的个数。\n```c\nint count2(uint32_t x) {\n    int n = 0;\n    while (x) { x &= (x - 1); n++; }   /* 每次消掉最低位的 1 */\n    return n;\n}\n```\n`x - 1` 会把最低位的 1 变成 0、它右边的 0 全变成 1，再与一下就正好抹掉最低位那个 1。\n\n**方法三**：查表法，预存 256 项的字节表，一次处理 8 位，4 次查表搞定——嵌入式里对时间敏感又不缺 Flash 时用这个。\n\n实际项目里如果 MCU 有 `__builtin_popcount()` 对应的硬件指令（ARM 的 CNT 系列），直接用内建函数最快。',
  followup: ['判断一个数是不是 2 的整数次幂，一行怎么写？', '怎么求一个数最低位的 1？(提示：x & -x)']
},
{
  id: 'c-015', cat: 'c-lang', type: 'single', level: 2, tags: ['位运算'],
  q: '判断无符号整数 x 是否为 2 的整数次幂（x > 0），最简洁的写法是？',
  options: [
    '(x & (x - 1)) == 0',
    '(x | (x - 1)) == 0',
    '(x ^ (x - 1)) == 0',
    'x % 2 == 0'
  ],
  answer: [0],
  a: '`(x & (x - 1)) == 0`。\n\n2 的整数次幂在二进制里**只有一个 1**。`x - 1` 会把那个 1 变 0、右边全变 1，两者相与必然为 0。例如 `8 = 1000`，`7 = 0111`，`8 & 7 = 0`。\n\n注意前提是 **x > 0**：x = 0 时 `0 & 0xFFFFFFFF == 0` 也成立，但 0 不是 2 的幂，所以完整判断要写成 `x && !(x & (x - 1))`。\n\n实际用途：判断缓冲区大小是否为 2 的幂，从而能用 `idx & (size - 1)` 代替 `idx % size` 做环形缓冲的回绕——取模换成与运算，在没有硬件除法器的 MCU 上快很多。',
  followup: ['环形缓冲区为什么常把容量设成 2 的幂？', 'x & -x 得到的是什么？']
},
{
  id: 'c-016', cat: 'c-lang', type: 'qa', level: 2, tags: ['指针', '内存'],
  q: '什么是野指针和悬空指针？怎么避免？',
  a: '**野指针**：指针变量本身没被初始化，里面是随机值。\n```c\nint *p;      /* 野指针，指向哪不知道 */\n*p = 10;     /* 往未知地址写，可能改坏别人的数据 */\n```\n\n**悬空指针（dangling pointer）**：指针指向的内存已经被释放或已经失效，但指针值还在。\n```c\nint *p = malloc(4);\nfree(p);     /* p 现在是悬空指针 */\n*p = 1;      /* use-after-free */\n```\n另一种是返回局部变量地址：函数一返回，栈帧就失效了。\n\n**防御手段**：\n- 定义指针时立刻初始化为 NULL。\n- **free 之后马上把指针置 NULL**，让后续误用变成对 NULL 解引用——立刻崩在现场，比悄悄改坏内存好定位得多。\n- 使用前判空。\n- 不返回局部变量地址（返回 static 变量或由调用者传入缓冲区）。\n\n嵌入式里野指针最恶心的地方在于：它往往不会当场崩，而是改坏了另一个模块的变量，几小时后在完全无关的地方表现出异常。',
  followup: ['free 同一个指针两次会怎样？', 'MCU 上没有 MMU，野指针写到外设寄存器区会发生什么？'],
},
{
  id: 'c-017', cat: 'c-lang', type: 'single', level: 2, tags: ['内存', '库函数'],
  q: 'memcpy 和 memmove 的区别是？',
  options: [
    '没有区别，memmove 只是别名',
    'memmove 能正确处理源和目的内存区域重叠的情况，memcpy 不保证',
    'memcpy 更安全，会检查边界',
    'memmove 只能用于结构体'
  ],
  answer: [1],
  a: '**memmove 保证重叠区域也能拷贝正确，memcpy 不保证**。\n\nmemcpy 的实现通常是从低地址往高地址逐字节（或逐字）拷。如果 `dst` 落在 `src` 内部靠后的位置，还没读到的源数据就先被写坏了。\n\nmemmove 会先判断方向：**如果 dst > src 且区域重叠，就从高地址往低地址倒着拷**，避开覆盖。\n\n实际场景：环形缓冲区搬移数据、数组内部整体前移删除元素，这些都必须用 memmove。\n\n性能上 memcpy 通常更快（不用判断），所以在能确认不重叠时用 memcpy。有些编译器还会把小尺寸的 memcpy 直接内联成几条 load/store。',
  followup: ['memcpy 拷贝结构体时有什么隐患？（提示：指针成员、填充字节）', 'memset 把一个 double 数组置成 1.0 可以吗？']
},
{
  id: 'c-018', cat: 'c-lang', type: 'qa', level: 2, tags: ['可重入', '中断'],
  q: '什么是可重入函数？编写可重入函数要注意什么？',
  a: '**可重入函数**：可以被多个执行流（中断、多任务、递归）同时进入，且各自结果互不影响。\n\n**不可重入的三个典型原因**：\n1. 使用了**静态变量或全局变量**保存中间状态（如 `strtok`、老版 `asctime`）。\n2. 调用了**不可重入的函数**（malloc/free、printf 大多不可重入）。\n3. 操作了**共享的硬件资源**（同一个 UART 发送寄存器、同一块 Flash）。\n\n**写法要点**：\n- 只用局部变量和入参，状态由调用者通过参数传进来（这就是为什么有 `strtok_r`、`localtime_r` 这些 `_r` 版本）。\n- 必须访问共享资源时，用关中断或互斥量保护临界区，并把临界区压到最短。\n- 中断服务程序里**不要调用 printf 和 malloc**——这是嵌入式里最常见的偶发死机原因之一。\n\n注意区分：**可重入一定线程安全，但线程安全不一定可重入**。用锁保护的函数是线程安全的，可如果在中断里重入它就会死锁。',
  followup: ['为什么 printf 不可重入？在 ISR 里想输出调试信息该怎么办？', '递归函数一定可重入吗？']
},
{
  id: 'c-019', cat: 'c-lang', type: 'single', level: 2, tags: ['整型提升', '陷阱'],
  q: '下面代码输出什么？\n\n```c\nunsigned int a = 10;\nint b = -20;\nif (a + b > 0)\n    printf("大于 0");\nelse\n    printf("小于等于 0");\n```',
  options: ['大于 0', '小于等于 0', '取决于编译器', '编译报错'],
  answer: [0],
  a: '输出 **"大于 0"**——这是有符号/无符号混用的经典陷阱。\n\n`a + b` 中一个是 unsigned int、一个是 int，按**通常算术转换**规则，**有符号数被转成无符号数**。`-20` 在 32 位下的补码是 `0xFFFFFFEC`，即 4294967276。相加后回绕得到 4294967286，是个很大的正数，所以判断成立。\n\n**防御**：\n- 编译时开 `-Wsign-compare`（`-Wall -Wextra` 里包含），让编译器警告你。\n- 循环里千万别写 `for (unsigned i = n - 1; i >= 0; i--)`——`i >= 0` 恒真，死循环。\n- 涉及可能为负的运算，统一用有符号类型；确实要比较时显式强转并加注释。\n\n嵌入式里这个坑常出现在"剩余长度"计算上：`if (buf_len - hdr_len > 0)`，当 buf_len 小于 hdr_len 时不但没走 else，还拿着一个巨大的长度去 memcpy，直接踩内存。',
  followup: ['size_t 是有符号还是无符号？循环里用它倒数要注意什么？', '怎么安全地写"剩余长度是否足够"的判断？']
},
{
  id: 'c-020', cat: 'c-lang', type: 'qa', level: 2, tags: ['函数指针'],
  q: '怎么声明一个函数指针？函数指针数组在嵌入式里有什么用？',
  a: '**声明**：\n```c\nint (*pf)(int, char);          /* 指向 "接收 int 和 char、返回 int" 的函数 */\nint  *pf2(int, char);          /* 注意：这是返回 int* 的函数，不是函数指针 */\n\ntypedef int (*handler_t)(int, char);  /* typedef 之后清爽很多 */\nhandler_t pf3 = my_func;\n```\n括号不能少，`(*pf)` 里的括号把 `*` 和 `pf` 先绑定。\n\n**嵌入式里的三个典型用途**：\n1. **回调**：驱动层暴露注册接口，应用层传函数进去，中断到来时驱动回调它。解耦上下层。\n2. **状态机 / 命令分发表**：用函数指针数组代替一长串 switch-case。\n   ```c\n   typedef struct { uint8_t sid; int (*handler)(uint8_t *, uint16_t); } service_t;\n   static const service_t table[] = {\n       { 0x10, svc_session_control },\n       { 0x27, svc_security_access },\n       { 0x34, svc_request_download },\n   };\n   ```\n   查表分发比 switch 更容易扩展，表还能放进 Flash 省 RAM。\n3. **中断向量表**：本质就是一个函数指针数组，放在 Flash 起始地址。\n\n**风险**：函数指针没初始化或被改写就跳飞，是 HardFault 的常见来源；表最好加 const 放只读段。',
  followup: ['中断向量表为什么要放在特定地址？怎么重定位？', '用函数指针表实现 UDS 服务分发，比 switch-case 好在哪、差在哪？'],
},
{
  id: 'c-021', cat: 'c-lang', type: 'single', level: 1, tags: ['typedef', '宏'],
  q: '下面两行的区别是？\n\n```c\ntypedef char * pchar_t;\n#define PCHAR char *\n```\n那么 `pchar_t a, b;` 与 `PCHAR c, d;` 中，哪些变量是指针？',
  options: [
    'a、b、c、d 都是指针',
    'a、b 是指针，c 是指针 d 不是',
    'a 是指针 b 不是，c、d 都是指针',
    '都不是指针'
  ],
  answer: [1],
  a: '**a、b 都是指针；c 是指针，d 是普通 char**。\n\n- `typedef` 定义的是**类型别名**，`pchar_t a, b;` 等价于 `char *a; char *b;`，两个都是指针。\n- `#define` 是**文本替换**，`PCHAR c, d;` 展开成 `char * c, d;`，按 C 的声明规则，`*` 只作用于紧跟的 `c`，所以 `d` 是 `char`。\n\n这就是为什么定义指针类型别名一律用 typedef，不用宏。同理，`const pchar_t p` 等价于 `char * const p`（指针本身是常量），而 `const PCHAR p` 展开成 `const char * p`（指向的内容是常量）——语义完全相反，是个很隐蔽的坑。',
  followup: ['#define 和 typedef 在作用域上有什么区别？']
},
{
  id: 'c-022', cat: 'c-lang', type: 'qa', level: 2, tags: ['union', '协议'],
  q: 'union 有什么用？在嵌入式里的典型场景是什么？',
  a: 'union 的所有成员**共用同一块内存**，大小等于最大成员（再按对齐取整）。\n\n**三个典型场景**：\n\n1. **同一块数据的多种视图**——寄存器位域访问最常见：\n```c\ntypedef union {\n    uint32_t all;\n    struct {\n        uint32_t enable   : 1;\n        uint32_t mode     : 3;\n        uint32_t reserved : 28;\n    } bits;\n} ctrl_reg_t;\n```\n既能整体读写（`reg.all = 0`），又能按位操作（`reg.bits.mode = 2`）。\n\n2. **协议报文的字节流 / 结构体互转**：\n```c\nunion { msg_t msg; uint8_t raw[sizeof(msg_t)]; } frame;\n```\n收到裸字节填进 `raw`，直接按 `msg` 解析。\n\n3. **节省 RAM**：几个互斥的大缓冲区共用同一块空间。\n\n**必须提醒的三条**：\n- 位域的**位序**（先填低位还是高位）是实现定义的，换编译器可能变，跨平台协议不要依赖它。\n- 通过一个成员写、另一个成员读，严格来说是"类型双关"，C 标准里对此有限制（虽然主流编译器都支持 union 双关）。\n- 字节序问题依旧存在。',
  followup: ['位域在大端和小端平台上的排列一样吗？', '用 union 做类型双关和用指针强转，哪个更安全？'],
},
{
  id: 'c-023', cat: 'c-lang', type: 'bool', level: 2, tags: ['栈', '返回值'],
  q: '函数内部定义的局部数组，可以直接把它的地址作为返回值返回给调用者使用。',
  answer: false,
  a: '**错误**。函数返回后栈帧就失效了，返回的指针变成悬空指针。\n\n```c\nchar *bad(void) {\n    char buf[32];\n    sprintf(buf, "hello");\n    return buf;      /* 危险：buf 随函数返回而销毁 */\n}\n```\n危险之处在于它**经常"看起来能用"**——刚返回时那块栈内存还没被覆盖，打印出来是对的；直到中间插进一次函数调用或中断，数据就变成乱码。这类 bug 极难定位。\n\n**四种正确做法**：\n1. 由调用者提供缓冲区：`void ok(char *out, size_t len)`——嵌入式里最推荐，内存归属清晰。\n2. 返回 static 数组（但**不可重入**，多任务/中断下有竞争）。\n3. 用 malloc 分配，由调用者 free（要约定好谁释放，MCU 上还要考虑碎片）。\n4. 返回结构体本身（值拷贝），小对象可以。\n\n注意：返回 `const char *` 指向**字符串字面量**是安全的，因为字面量在 .rodata 里，生命周期是整个程序。',
  followup: ['为什么返回 static 数组不可重入？', '嵌入式里为什么普遍不推荐 malloc？']
},
{
  id: 'c-024', cat: 'c-lang', type: 'qa', level: 2, tags: ['堆', 'malloc'],
  q: '嵌入式系统里为什么普遍不推荐用 malloc/free？如果必须用怎么办？',
  a: '**四个原因**：\n1. **内存碎片**。长时间反复申请释放不同大小的块，堆被切碎，总空闲量够但没有连续块，malloc 返回 NULL。MCU 上没有 MMU 做整理，碎片是不可逆的。\n2. **时间不确定**。malloc 的耗时取决于堆的状态，不是常数时间，破坏实时性。\n3. **失败难处理**。返回 NULL 之后，一个深层函数很难优雅地把错误一路传上去。很多代码干脆不判空，直接崩。\n4. **泄漏无人回收**。桌面程序退出就释放了，嵌入式设备要连续跑几个月。\n\n**替代方案**：\n- **静态分配**：编译期确定所有缓冲区，链接时就知道 RAM 够不够。这是车载/航空领域的强制要求（MISRA C 直接禁用动态内存）。\n- **内存池 / 固定块分配器**：预先切成若干等大的块，申请释放都是 O(1)，且**不会产生碎片**。FreeRTOS 的 heap_4/heap_5、或自己写的 slab 都属于这类。\n- 确实要用 malloc 时：**只在初始化阶段申请，运行期不再释放**，把不确定性挡在启动阶段。\n\n面试时最好补一句实践细节：给堆区加"金丝雀"标记或用 `configTOTAL_HEAP_SIZE` 的水位统计接口监控最小剩余量，长跑测试时定期上报。',
  followup: ['FreeRTOS 的 heap_1 到 heap_5 分别是什么策略？各适合什么场景？', '内存池怎么实现 O(1) 的申请和释放？'],
},
{
  id: 'c-025', cat: 'c-lang', type: 'multi', level: 2, tags: ['extern', '链接'],
  q: '关于头文件和 extern，下面哪些说法是正确的？（多选）',
  options: [
    '头文件里应该只放声明，不放定义，否则被多个 .c 包含时会出现重复定义',
    '全局变量应该在一个 .c 里定义，在头文件里用 extern 声明',
    '头文件加 #ifndef/#define/#endif 是为了防止链接期的重复定义',
    'static 函数不需要在头文件里声明，因为它只在本文件可见'
  ],
  answer: [0, 1, 3],
  a: '正确的是 **A、B、D**。\n\nC 项说法有误：`#ifndef` 这类**头文件卫士防的是同一个编译单元内的重复包含**（预处理阶段），不是链接期的重复定义。\n\n举例：a.c 同时包含了 x.h 和 y.h，而两者都包含 common.h。没有卫士的话 common.h 的内容在 a.c 里出现两次，结构体重复定义，**编译**就过不去。\n\n而链接期的重复定义是另一回事：如果头文件里写了 `int g_count = 0;`（定义而非声明），那么每个包含它的 .c 都会生成一个 `g_count` 符号，**链接**时报 multiple definition——头文件卫士对此无能为力。正确做法就是 B：\n```c\n/* common.h */  extern int g_count;\n/* common.c */  int g_count = 0;\n```\n\n补充：`#pragma once` 和头文件卫士作用相同，前者更简洁但不是标准（主流编译器都支持）。',
  followup: ['为什么 C++ 里调用 C 函数要加 extern "C"？', '两个 .c 里都定义了同名的非 static 全局变量，链接会怎样？']
},
{
  id: 'c-026', cat: 'c-lang', type: 'qa', level: 3, tags: ['柔性数组'],
  q: '什么是柔性数组成员（flexible array member）？在协议解析里怎么用？',
  a: 'C99 允许结构体的**最后一个成员**是一个未指定长度的数组：\n\n```c\ntypedef struct {\n    uint8_t  sid;\n    uint16_t len;\n    uint8_t  data[];    /* 柔性数组成员，不占 sizeof */\n} msg_t;\n```\n\n`sizeof(msg_t)` **不包含 data**（这里是 4：1 + 1 填充 + 2）。分配时按需要的长度一次性申请：\n\n```c\nmsg_t *m = malloc(sizeof(msg_t) + payload_len);\nm->len = payload_len;\nmemcpy(m->data, payload, payload_len);\n```\n\n**好处**：结构体头和变长数据在**一块连续内存**里，一次申请一次释放，没有二次间接寻址，缓存友好。\n\n**协议解析里更常见的用法是不分配、直接映射**：收到一帧字节流后 `msg_t *m = (msg_t *)rx_buf;`，然后 `m->data` 就直接指向负载区。但这么写要特别小心两件事：\n- **对齐**：rx_buf 必须满足 msg_t 的对齐要求，否则在 ARM 上可能 Fault。\n- **填充字节**：结构体里的填充会让内存布局和线上字节流对不上，所以这类结构体通常要 packed，或者干脆手工按偏移解析。\n\n历史写法是 `uint8_t data[0];`（GCC 扩展）或 `data[1]`（struct hack），C99 之后应该用 `data[]`。',
  followup: ['柔性数组和指针成员相比，各有什么优劣？', '为什么柔性数组必须是最后一个成员？'],
},
{
  id: 'c-027', cat: 'c-lang', type: 'single', level: 3, tags: ['求值顺序', 'UB'],
  q: '`i = 3; i = i++ + ++i;` 这行代码的结果是？',
  options: [
    '一定是 8',
    '一定是 9',
    '未定义行为，不同编译器结果可能不同',
    '编译错误'
  ],
  answer: [2],
  a: '**未定义行为（UB）**。\n\nC 标准规定：在两个序列点之间，**同一个对象的存储值最多只能被修改一次**，而且读取该对象的值只能用于确定要写入的新值。这行里 `i` 被修改了两次（`i++` 和 `++i`），违反规则。\n\n结果完全取决于编译器怎么排指令——GCC 可能给 8，MSVC 可能给 9，开不同优化级别还可能变。**不存在"正确答案"，讨论它算出几毫无意义**。\n\n同类 UB：`a[i] = i++;`、`f(i++, i++);`、`printf("%d %d", i++, i++);`。\n\n**实际态度**：这种代码在项目里应该直接判为缺陷，拆成两行写清楚。MISRA C 有专门条款禁止在一个表达式里对同一变量多次赋值。面试时答"UB"并说明理由，比硬算出一个数更能得分。',
  followup: ['C11 引入的"序列点"改叫什么了？（提示：sequenced before）', '你在项目里用什么工具拦这类问题？']
},
{
  id: 'c-028', cat: 'c-lang', type: 'qa', level: 2, tags: ['const', '优化'],
  q: 'const 修饰的变量真的不能被修改吗？编译器会把它放在哪？',
  a: '**const 是编译期的约束，不是运行期的保护。**\n\n对于**局部 const 变量**，可以用指针绕过：\n```c\nconst int a = 10;\nint *p = (int *)&a;\n*p = 20;\nprintf("%d", a);   /* 可能打印 10！ */\n```\n打印 10 是因为编译器认定 a 不会变，**直接把常量 10 编译进指令**，根本没去读内存。所以内存里可能真的变成 20 了，但读出来的还是 10——这本身就是 UB。\n\n对于**全局 const 变量或 const 数组**，编译器通常放进 **.rodata 段**。在 MCU 上 .rodata 位于 Flash，写它要么无效、要么触发 Fault；在 Linux 上会段错误。\n\n**嵌入式里的实用推论**：\n- 大的查找表、字库、配置默认值加 const，能从 RAM 挪到 Flash，省下宝贵的 RAM。\n- 函数参数写 `const uint8_t *buf` 是一种契约声明：告诉调用者"我不改你的数据"，同时让编译器帮忙检查。\n- `const volatile` 的组合是有意义的：只读的硬件状态寄存器——我不能写它，但它会自己变。',
  followup: ['const volatile 用在什么场景？', 'const 数组和普通数组在 map 文件里分别落在哪个段？'],
},
{
  id: 'c-029', cat: 'c-lang', type: 'single', level: 2, tags: ['数组', '指针'],
  q: '`void func(int arr[10])` 中，`sizeof(arr)` 在 32 位平台上等于？',
  options: ['40', '10', '4', '编译错误'],
  answer: [2],
  a: '**4**（指针大小）。\n\n C 语言里**数组作为函数参数时一律退化成指向首元素的指针**，`int arr[10]`、`int arr[]`、`int *arr` 三种写法在函数签名里完全等价，那个 `10` 只是给读代码的人看的注释，编译器直接忽略。\n\n所以函数内部拿不到数组长度，必须**额外传一个长度参数**：\n```c\nvoid func(int *arr, size_t n);\n```\n\n这也是缓冲区溢出的一大来源：函数以为自己拿到的是 10 个元素，调用者实际只传了 5 个。防御手段是把指针和长度打包成结构体一起传，或者（C99）用 `void func(size_t n, int arr[static n])` 声明至少有 n 个元素——但后者只是给编译器的提示，运行期不检查。',
  followup: ['怎么在宏里安全地算出数组元素个数？这个宏对指针会失效吗？', 'C99 的变长数组参数 int arr[static n] 有什么作用？']
},
{
  id: 'c-030', cat: 'c-lang', type: 'qa', level: 3, tags: ['指针', '二级指针'],
  q: '什么时候需要二级指针？举个实际例子。',
  a: '核心场景是：**需要在函数内部修改调用者的指针变量本身**。\n\nC 是值传递，传一级指针进去，函数改的是形参的副本，调用者的指针没变：\n```c\nvoid bad_alloc(char *p, size_t n) { p = malloc(n); }  /* 白改 */\n\nvoid ok_alloc(char **p, size_t n) { *p = malloc(n); } /* 有效 */\n\nchar *buf = NULL;\nok_alloc(&buf, 64);\n```\n\n**四个典型用途**：\n1. **由函数分配内存并回传**（如上），或 free 后置 NULL：`void safe_free(void **p) { free(*p); *p = NULL; }`。\n2. **链表的插入/删除**。用二级指针指向"指向当前节点的那个指针"，删除时不需要单独维护 prev，头节点也不用特殊处理：\n```c\nvoid remove(node_t **head, int val) {\n    node_t **pp = head;\n    while (*pp) {\n        if ((*pp)->val == val) { *pp = (*pp)->next; return; }\n        pp = &(*pp)->next;\n    }\n}\n```\n这段代码 Linus 说过是"理解指针"的分水岭。\n3. **字符串数组** `char *argv[]`，函数参数里就是 `char **argv`。\n4. **回调注册表**，需要把函数指针数组的地址传出去。',
  followup: ['上面那段链表删除，如果用一级指针 + prev 要多写多少代码？', 'char **argv 和 char *argv[][] 有什么区别？']
},
{
  id: 'c-031', cat: 'c-lang', type: 'bool', level: 2, tags: ['浮点'],
  q: '判断两个 float 是否相等，应该直接用 `if (a == b)`。',
  answer: false,
  a: '**错误**。浮点数在二进制里大多是近似表示，`0.1 + 0.2` 并不精确等于 `0.3`。直接用 `==` 比较几乎必然出问题。\n\n**正确做法**是比较差值是否小于一个容差：\n```c\n#include <math.h>\n#define EPS 1e-6f\nif (fabsf(a - b) < EPS) { ... }\n```\n更严谨的做法要考虑量级，用相对误差：`fabsf(a-b) <= EPS * fmaxf(fabsf(a), fabsf(b))`——因为绝对容差对很大或很小的数都不合适。\n\n**嵌入式补充**（这点更容易加分）：\n- 很多 MCU 没有 FPU，浮点靠软件模拟，一次运算几百个周期。中断服务程序里做浮点运算是大忌。\n- 有 FPU 的核（如 Cortex-M4F）在 RTOS 下要注意**任务切换时是否保存 FPU 上下文**，否则会出现极难定位的数据错乱。\n- 传感器数据处理优先考虑**定点数 / Q 格式**，既快又确定。',
  followup: ['Cortex-M4F 上用了 FPU，FreeRTOS 需要额外配置什么？', '什么是 Q15 定点格式？怎么做定点乘法？']
},
{
  id: 'c-032', cat: 'c-lang', type: 'qa', level: 2, tags: ['预处理', '条件编译'],
  q: '条件编译有哪几种写法？在嵌入式项目里怎么用才不失控？',
  a: '**写法**：`#if / #elif / #else / #endif`、`#ifdef / #ifndef`、`#if defined(A) && !defined(B)`。\n\n**典型用途**：\n- 多硬件版本适配：`#if BOARD_REV >= 2`\n- 调试代码开关：`#ifdef DEBUG`\n- 跨平台：`#ifdef __GNUC__`\n- 头文件卫士\n\n**失控的表现和对策**（这部分才是面试想听的）：\n- **嵌套超过两层就没人看得懂了**。对策：把差异下沉到独立的 .c 文件，用**构建系统选择编译哪个文件**，而不是在一个文件里 #ifdef 到处开花。这也是 Linux 内核的做法。\n- **未被编译进去的分支不会被编译器检查**，改代码时容易漏掉，等切到那个配置才发现编译不过。对策：CI 里把所有配置组合都编一遍。\n- **`#ifdef DEBUG` 里的代码和正式代码行为不一致**，导致"调试版好的，正式版崩"。对策：调试宏尽量只增加日志、不改变控制流。\n\n一个小技巧：用 `#if DEBUG_LEVEL > 0` 而不是 `#ifdef`，前者在宏拼错时会当作 0 静默失效……所以更好的是配合 `-Wundef` 让编译器对未定义的宏报警。',
  followup: ['#if 和 #ifdef 在宏未定义时行为有什么不同？', '怎么用宏实现分级日志且在正式版本里彻底不占空间？']
},
{
  id: 'c-033', cat: 'c-lang', type: 'single', level: 1, tags: ['存储'],
  q: '函数内的 `static int count = 0;` 存放在哪个段？',
  options: ['栈上', '堆上', '.bss 段', '.text 段'],
  answer: [2],
  a: '**.bss 段**。\n\nstatic 局部变量虽然作用域在函数内，但**存储期是静态的**，和全局变量放在一起。初值为 0（或不给初值）落在 .bss，启动时统一清零；初值非 0（如 `static int count = 5;`）则落在 .data，初值存 Flash、启动时搬到 RAM。\n\n几个容易被追问的点：\n- **初始化只执行一次**，是在程序启动阶段完成的，不是每次进函数时做。\n- 因为是共享的静态存储，**static 局部变量让函数变成不可重入**——多任务或中断里同时调用会互相干扰。\n- 它在 map 文件里会以类似 `count.0` 的修饰名出现（编译器加后缀避免同名冲突）。',
  followup: ['两个不同函数里都有 static int count，链接时会冲突吗？', '为什么 static 局部变量会破坏可重入性？']
},
{
  id: 'c-034', cat: 'c-lang', type: 'qa', level: 3, tags: ['内联汇编', '原子'],
  q: '在没有操作系统的裸机程序里，怎么保证一段代码的原子性？',
  a: '**方案一：关中断（最常用）**\n```c\nuint32_t primask = __get_PRIMASK();\n__disable_irq();\n/* 临界区 */\n__set_PRIMASK(primask);   /* 恢复原状态，不是无脑开中断 */\n```\n**关键细节**：一定要**保存并恢复原来的中断状态**，而不是直接 `__enable_irq()`。否则在一个本来就关着中断的上下文里调用这段代码，退出时会把中断误开，破坏外层的临界区。这是嵌入式面试的高频加分点。\n\n**方案二：硬件原子指令**。Cortex-M3 以上有 `LDREX/STREX`（独占访问），可以实现无锁的原子加、CAS。C11 的 `<stdatomic.h>` 或 GCC 的 `__atomic_*` 内建函数底层就是它。\n\n**方案三：位带操作（bit-band）**。Cortex-M3/M4 把某些 SRAM 和外设区的每一位映射到独立地址，对该地址的读写天然是原子的，避开了读-改-写。\n\n**方案四：从设计上避开**。比如中断只写、主循环只读的单向标志位（配 volatile），或者单生产者单消费者的环形缓冲——用无锁结构规避临界区，比加锁更可靠。\n\n**注意关中断的代价**：临界区期间所有中断被屏蔽，会增加中断延迟。所以临界区必须极短，绝不能在里面做 printf、等待外设或调用不确定耗时的函数。',
  followup: ['为什么必须保存并恢复 PRIMASK 而不是直接开中断？', 'LDREX/STREX 怎么实现一个原子自增？', 'BASEPRI 和 PRIMASK 关中断有什么区别？'],
},
{
  id: 'c-035', cat: 'c-lang', type: 'qa', level: 2, tags: ['环形缓冲', '并发'],
  q: '写一个单生产者单消费者的环形缓冲区，为什么它可以不用加锁？',
  a: '```c\n#define BUF_SZ 256                    /* 必须是 2 的幂 */\ntypedef struct {\n    uint8_t buf[BUF_SZ];\n    volatile uint16_t head;           /* 只由生产者写 */\n    volatile uint16_t tail;           /* 只由消费者写 */\n} ring_t;\n\nint ring_put(ring_t *r, uint8_t d) {\n    uint16_t next = (r->head + 1) & (BUF_SZ - 1);\n    if (next == r->tail) return -1;   /* 满 */\n    r->buf[r->head] = d;\n    r->head = next;                   /* 先写数据，最后更新索引 */\n    return 0;\n}\n\nint ring_get(ring_t *r, uint8_t *d) {\n    if (r->tail == r->head) return -1; /* 空 */\n    *d = r->buf[r->tail];\n    r->tail = (r->tail + 1) & (BUF_SZ - 1);\n    return 0;\n}\n```\n\n**为什么免锁**：\n- **每个索引只有一个写者**：生产者只写 head，消费者只写 tail，双方只读对方的索引。不存在两个执行流同时改同一个变量，也就没有读-改-写竞争。\n- **顺序有讲究**：必须**先写完数据、再更新 head**。反过来的话，消费者可能看到 head 已经前进但数据还没写进去，读到脏数据。\n- 索引必须是 volatile（防止编译器把它缓存在寄存器里），且索引的读写本身要是**单指令原子**的——16 位索引在 32 位 MCU 上没问题，但如果索引是 64 位就得另想办法。\n\n**为什么容量取 2 的幂**：回绕用 `& (BUF_SZ-1)` 代替 `% BUF_SZ`，省掉除法。很多 MCU 没有硬件除法器，取模要几十个周期。\n\n**典型用途**：串口中断收数据往 buf 里塞，主循环从 buf 里取——这是最经典的 ISR 与主循环解耦模式。\n\n注意：这个结构**只在单生产者单消费者时免锁**。多生产者就必须加锁或用 CAS。',
  followup: ['多生产者的场景该怎么改？', '在弱内存序的处理器上，这段代码还需要加什么？（提示：内存屏障）', '为什么牺牲一个存储单元来区分空和满？还有别的办法吗？'],
},
{
  id: 'c-036', cat: 'c-lang', type: 'qa', level: 1, tags: ['堆', '栈', '内存'],
  q: '堆和栈有什么区别？',
  a: '| | 栈（Stack） | 堆（Heap） |\n|---|---|---|\n| 分配方式 | 编译器自动，调用函数时 SP 下移 | 程序员手动（malloc/free）或运行时动态分配 |\n| 管理方 | 编译器/CPU 自动 | 程序员负责，或 GC |\n| 大小 | 链接期固定，MCU 上通常几 KB~几十 KB | 受限于可用 RAM，通常比栈大 |\n| 生长方向 | 通常**从高地址向低地址**生长 | 通常从低地址向高地址生长 |\n| 速度 | **极快**——只需移动 SP（一条指令） | 慢——malloc 要在堆上找合适的空闲块，有碎片化问题 |\n| 碎片 | 无碎片（后进先出，天然整齐） | 会产生外部碎片 |\n| 存什么 | 局部变量、函数参数、返回地址、现场保护 | 动态分配的对象，生命周期由程序员控制 |\n| 溢出后果 | 栈溢出（Stack Overflow）——覆盖相邻内存，可能触发 HardFault、行为不可预测 | 堆越界——野指针、double free，同样危险 |\n\n**嵌入式特别关注的点**：\n\n1. **MCU 上的栈大小**：链接脚本里静态配置，改了要重新编译。**栈太小是嵌入式随机崩溃最常见的原因之一**——中断嵌套、递归调用、大数组局部变量都会吃栈。用 `uxTaskGetStackHighWaterMark()`（FreeRTOS）或在栈区填特征值再检查水位线的方式监控。\n\n2. **MCU 上不鼓励用动态内存**：malloc 在 MCU 上有碎片化、确定性差、线程安全（裸机要关中断）等问题，**MISRA-C 直接禁止运行时动态内存分配**。能静态分配的就静态分配，需要动态对象时用内存池（pool）。\n\n3. **堆和栈相遇**：如果堆和栈在同一块 RAM 里且中间没有 Guard Region，malloc 过多或递归过深会导致它们相互踩坏，现象极为诡异。可以在两者之间放一个 MPU 保护区域来检测。',
  followup: ['MCU 上怎么检测栈溢出？', '为什么嵌入式开发不推荐用 malloc？', '堆溢出和栈溢出的现象有什么不同？']
},
{
  id: 'c-037', cat: 'c-lang', type: 'qa', level: 1, tags: ['栈', '局部变量', '生命周期'],
  q: '函数中的局部变量，其栈空间是什么时候分配、什么时候释放的？',
  a: '**分配时机：函数调用时（进入函数体时）**\n\n函数调用发生时，硬件/编译器做以下事情：\n1. 把返回地址压栈（或存到 LR 寄存器）\n2. 把 Callee-saved 寄存器压栈（现场保护）\n3. **SP（栈指针）减去本函数局部变量所需的空间**——这一步就是"分配"\n\n所有局部变量的地址此时就是确定的（相对于 SP 的固定偏移）。**这是一条指令（`SUB SP, SP, #size`）完成的，极快。**\n\n**释放时机：函数返回时（执行 return 之后、控制权回到调用者之前）**\n\n1. SP 加回去（`ADD SP, SP, #size`）——相当于"释放"所有局部变量的空间\n2. 恢复 Callee-saved 寄存器\n3. 跳回返回地址\n\n**重要推论**：\n\n- **局部变量的生命周期严格绑定于函数执行期间**。函数一返回，那块栈空间就"归还"了，虽然数据可能还残留在那里，但**下一次函数调用会覆盖它**——这就是为什么"返回局部变量的指针"是未定义行为。\n\n```c\nint *get_ptr(void) {\n    int x = 42;\n    return &x;   /* 危险！函数返回后 x 的栈空间被回收 */\n}\n/* 调用者拿到的指针指向随时可能被覆盖的内存 */\n```\n\n- **VLA（变长数组）例外**：如果局部变量是运行时才确定大小的 VLA，编译器会在运行时动态调整 SP，用完后再还原。这在嵌入式上要谨慎使用（MISRA-C 禁止），因为大小不可预测可能导致栈溢出。\n\n- **静态局部变量不在栈上**：`static int x;` 的 x 放在 .data/.bss 段，不随函数调用分配/释放，生命周期是整个程序运行期间。',
  followup: ['返回局部变量的指针为什么是 UB？', '静态局部变量和普通局部变量有什么区别？', '函数调用的完整过程（调用约定）是什么？']
}
]);
