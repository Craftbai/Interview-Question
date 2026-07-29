QBANK.add([
{
  id: 'lxa-001', cat: 'linux-app', type: 'qa', level: 1, tags: ['文件IO'],
  q: '标准 IO（fopen/fread）和系统调用 IO（open/read）有什么区别？',
  a: '**层次不同**：标准 IO 是 C 库函数，底层还是调用 open/read/write；系统调用 IO 直接陷入内核。\n\n| | 标准 IO（FILE*） | 系统调用（fd） |\n|---|---|---|\n| 返回 | `FILE *` 结构指针 | `int` 文件描述符 |\n| 缓冲 | **有用户态缓冲** | 无（只有内核页缓存） |\n| 可移植性 | ANSI C，跨平台 | POSIX，Unix 系 |\n| 适用 | 普通文件、文本处理 | 设备文件、socket、需要精确控制时 |\n\n**核心差异是用户态缓冲**。标准 IO 在用户空间攒够一定量才真正调用 write，**大幅减少系统调用次数**（系统调用有上下文切换开销）。三种缓冲模式：\n- **全缓冲**：普通文件默认，缓冲区满才写\n- **行缓冲**：终端默认，遇到 `\\n` 就写\n- **无缓冲**：stderr，立即输出（保证错误信息不丢）\n\n**嵌入式里的实际影响**：\n1. **操作设备文件必须用系统调用**。`/dev/ttyS0`、`/dev/i2c-1` 这类设备需要精确控制每次读写的时机和长度，用户态缓冲会打乱时序。而且设备通常还要 `ioctl()`，FILE* 用不了。\n2. **printf 的调试陷阱**：程序崩溃前的 printf 可能还在缓冲区里没输出，导致"日志显示走到 A 但实际已经到 B 了"的误判。解决：`fflush(stdout)`，或者用 `setvbuf` 设成无缓冲，或者直接用 `write(2, ...)` 输出到 stderr。\n3. **两套接口不要混用**同一个文件，缓冲状态会打架。要混用得先 `fflush`。',
  followup: ['为什么 stderr 是无缓冲的？', '程序崩溃时怎么保证日志不丢？', 'fflush 和 fsync 有什么区别？'],
},
{
  id: 'lxa-002', cat: 'linux-app', type: 'qa', level: 2, tags: ['进程', '线程'],
  q: '进程和线程有什么区别？嵌入式 Linux 里怎么选？',
  a: '**本质区别**：进程是**资源分配**的基本单位，线程是**CPU 调度**的基本单位。\n\n| | 进程 | 线程 |\n|---|---|---|\n| 地址空间 | **独立** | **共享**（同进程内） |\n| 文件描述符 | 独立 | 共享 |\n| 创建开销 | 大（fork 要复制页表，虽有 COW） | 小 |\n| 切换开销 | 大（要切页表、刷 TLB） | 小（只切寄存器和栈） |\n| 通信 | 需要 IPC（管道、共享内存…） | 直接读写全局变量 |\n| 隔离性 | **强**，一个崩了不影响别的 | **弱**，一个线程段错误整个进程挂掉 |\n\n**线程共享什么**：地址空间（代码、全局变量、堆）、文件描述符表、信号处理函数、当前工作目录。\n**线程独有什么**：栈、寄存器（含 PC、SP）、errno、线程局部存储（TLS）、信号掩码。\n\n**嵌入式 Linux 里的选择**：\n\n**用多线程**：模块间需要频繁交换大量数据（音频采集 → 编码 → 网络发送）。共享内存零拷贝，效率最高。代价是必须小心加锁，一个野指针就整个进程崩溃。\n\n**用多进程**：\n- 模块需要**故障隔离**。比如网络通信模块可能因为对端异常数据崩溃，独立成进程后，主控进程可以监控并重启它，不影响核心功能\n- 需要**不同权限**（一个以 root 跑硬件，一个降权跑网络服务）\n- 模块可以独立升级\n\n**常见的实际架构**：主控进程 + 几个功能进程，进程内再用多线程。既有隔离性，又有效率。用 socket 或共享内存做进程间通信，用守护进程或 systemd 做进程监控和自动重启。\n\n**一个实践细节**：多线程程序里 fork 是危险的——**只有调用 fork 的那个线程会被复制到子进程**，如果其他线程正持有锁，子进程里那把锁永远解不开。所以 fork 之后应该立刻 exec，或者用 `pthread_atfork` 注册处理函数。',
  followup: ['多线程程序里 fork 为什么危险？', '写时复制（COW）是怎么工作的？', '怎么监控并自动重启崩溃的子进程？'],
},
{
  id: 'lxa-003', cat: 'linux-app', type: 'qa', level: 2, tags: ['进程', '僵尸进程'],
  q: '什么是僵尸进程和孤儿进程？怎么避免僵尸进程？',
  a: '**僵尸进程（Zombie）**：子进程已经退出，但**父进程还没调用 wait/waitpid 回收它的退出状态**。此时子进程的资源大部分已释放，但**进程描述符（PCB）还保留在内核里**，占着一个 PID。`ps` 里显示状态为 `Z` 或 `<defunct>`。\n\n**危害**：PID 是有限资源（`/proc/sys/kernel/pid_max`）。长期运行的服务如果不断产生僵尸进程，最终会耗尽 PID，**导致整个系统无法创建新进程**。嵌入式设备连续跑几个月，这个问题很致命。\n\n**孤儿进程（Orphan）**：父进程先退出了，子进程还在跑。子进程会被 **init（PID 1）收养**，init 会负责回收它。**孤儿进程无害**，它有人管。\n\n**避免僵尸的三种方法**：\n\n**1. 父进程主动 wait**\n```c\npid_t pid = fork();\nif (pid > 0) {\n    int status;\n    waitpid(pid, &status, 0);   /* 阻塞等待 */\n}\n```\n缺点是阻塞。可以用 `WNOHANG` 非阻塞轮询。\n\n**2. SIGCHLD 信号处理（推荐）**\n```c\nvoid sigchld_handler(int sig) {\n    /* while 循环很重要：信号不排队，多个子进程同时退出只会收到一个信号 */\n    while (waitpid(-1, NULL, WNOHANG) > 0);\n}\nsignal(SIGCHLD, sigchld_handler);\n```\n**那个 while 循环是关键细节**——Unix 信号不排队，如果三个子进程同时退出，可能只触发一次 SIGCHLD。不用 while 就会漏掉两个，变成僵尸。\n\n**3. 忽略 SIGCHLD**\n```c\nsignal(SIGCHLD, SIG_IGN);   /* 内核直接回收，不产生僵尸 */\n```\n最简单，但父进程就拿不到子进程的退出状态了。\n\n**4. 两次 fork**\n父 fork 出子，子再 fork 出孙，然后子立刻退出。孙进程变成孤儿被 init 收养，父进程 wait 一下子进程即可。守护进程的经典写法。\n\n**排查**：`ps aux | grep defunct` 看有没有僵尸；`ps -o ppid= -p <僵尸PID>` 找到不负责任的父进程。',
  followup: ['为什么 SIGCHLD 处理函数里要用 while 循环？', '信号为什么不排队？', '守护进程为什么要 fork 两次？']
},
{
  id: 'lxa-004', cat: 'linux-app', type: 'qa', level: 2, tags: ['IPC'],
  q: 'Linux 有哪些进程间通信方式？各适合什么场景？',
  a: '**1. 管道（Pipe）**\n- 匿名管道：只能用于**有亲缘关系**的进程（父子），单向\n- 命名管道（FIFO）：文件系统里有个节点，**任意进程都能用**\n- 简单，但只能传字节流，需要自己划分消息边界\n\n**2. 信号（Signal）**\n- 只能传递"发生了某事"这一个比特的信息（外加 `sigqueue` 可带一个整数）\n- **异步**，会打断正在执行的代码\n- 适合通知退出、重载配置。**不适合传数据**\n\n**3. 消息队列（Message Queue）**\n- POSIX（`mq_*`）或 System V（`msgget`）\n- **保留消息边界**，支持优先级\n- 内核维护，有大小限制\n\n**4. 共享内存（Shared Memory）**\n- **最快**，因为数据不经过内核拷贝，两个进程直接读写同一块物理内存\n- **必须自己做同步**（配合信号量或互斥锁），否则数据竞争\n- 适合大数据量、高频交换（视频帧、音频缓冲）\n\n**5. 信号量（Semaphore）**\n- 用于同步而非传数据，通常配合共享内存使用\n\n**6. Socket**\n- **Unix domain socket**：本机进程间，比 TCP 快（不走协议栈）\n- **TCP/UDP socket**：能跨机器\n- 最灵活，能配合 select/epoll 做多路复用，**这是它相比其他 IPC 的最大优势**\n\n**7. mmap 映射文件**\n- 多个进程映射同一个文件，效果类似共享内存，且数据可以持久化\n\n**嵌入式项目里的实际选择**：\n\n| 场景 | 推荐 |\n|---|---|\n| 传大块数据（图像、音频） | **共享内存 + 信号量** |\n| 传控制命令、小消息 | **Unix domain socket** 或消息队列 |\n| 需要和 IO 事件一起等 | **socket**（能进 epoll） |\n| 简单的父子进程通信 | 管道 |\n| 通知退出/重载配置 | 信号 |\n| 可能跨设备扩展 | TCP socket |\n\n**为什么 socket 用得最多**：它能被 epoll 统一管理，和网络 IO、串口、定时器 fd 混在一个事件循环里，架构最干净。牺牲一点性能换来的可维护性通常是划算的。',
  followup: ['共享内存怎么和信号量配合？', 'Unix domain socket 比 TCP 快在哪？', '什么是 eventfd 和 timerfd？'],
},
{
  id: 'lxa-005', cat: 'linux-app', type: 'qa', level: 3, tags: ['epoll'], resume: true,
  q: 'select、poll、epoll 有什么区别？epoll 为什么更高效？',
  a: '**select**\n- 用**位图**表示监听的 fd 集合，有 **FD_SETSIZE（通常 1024）的硬上限**\n- 每次调用要**把整个 fd 集合从用户态拷到内核**\n- 返回后要**遍历所有 fd** 才知道哪个就绪，O(n)\n- **fd 集合是传入传出参数**，每次调用前都要重新设置\n\n**poll**\n- 用 `pollfd` 数组代替位图，**没有数量上限**\n- 仍然是每次全量拷贝 + 返回后全量遍历，O(n)\n- 分离了输入的 events 和输出的 revents，不用每次重设\n\n**epoll**\n- **三个接口**：`epoll_create` 创建实例、`epoll_ctl` 增删改监听的 fd、`epoll_wait` 等待事件\n- **fd 集合常驻内核**（红黑树维护），只在变化时通过 epoll_ctl 增删，**不需要每次全量拷贝**\n- 内核用**回调机制**：fd 就绪时由驱动的回调把它加入就绪链表\n- `epoll_wait` **直接返回就绪链表**，只需处理真正就绪的 fd，**O(就绪数) 而不是 O(总数)**\n\n**性能差距的本质**：\n- 连接数少且大部分活跃时，三者差别不大\n- **连接数多但活跃比例低时，epoll 优势巨大**。1 万个连接里只有 10 个有数据，select/poll 每次都要遍历 1 万个，epoll 只处理 10 个\n\n**LT 与 ET（epoll 特有）**：\n- **LT（水平触发，默认）**：只要 fd 还有数据可读就会**持续通知**。编程简单，一次没读完下次还会通知。select/poll 只有这个模式\n- **ET（边沿触发）**：只在**状态发生变化时通知一次**。效率更高（通知次数少），但**必须一次把数据读干净**，否则剩下的数据就再也收不到通知了\n\n**ET 模式的正确用法（必须记住）**：\n1. fd **必须设为非阻塞**\n2. **循环 read 直到返回 -1 且 errno == EAGAIN**\n```c\nwhile ((n = read(fd, buf, sizeof(buf))) > 0) { process(buf, n); }\nif (n < 0 && errno != EAGAIN) { /* 真的出错了 */ }\n```\n如果 fd 是阻塞的，读干净之后再 read 就会**永久阻塞在那里**，整个事件循环卡死。这是 ET 模式最经典的 bug。\n\n**嵌入式场景**：连接数通常不多，**LT 模式足够且不容易出错**。ET 主要用于高并发服务器。',
  followup: ['ET 模式为什么必须用非阻塞 fd？', 'epoll 的红黑树和就绪链表分别起什么作用？', '什么是惊群问题？epoll 怎么处理？']
},
{
  id: 'lxa-006', cat: 'linux-app', type: 'qa', level: 2, tags: ['pthread', '同步'],
  q: '互斥锁和条件变量怎么配合使用？为什么 pthread_cond_wait 要传互斥锁？',
  a: '**典型用法（生产者-消费者）**：\n```c\npthread_mutex_t mtx = PTHREAD_MUTEX_INITIALIZER;\npthread_cond_t  cond = PTHREAD_COND_INITIALIZER;\nint ready = 0;\n\n/* 消费者 */\npthread_mutex_lock(&mtx);\nwhile (!ready) {                       /* 注意是 while 不是 if */\n    pthread_cond_wait(&cond, &mtx);\n}\nconsume();\npthread_mutex_unlock(&mtx);\n\n/* 生产者 */\npthread_mutex_lock(&mtx);\nready = 1;\npthread_cond_signal(&cond);\npthread_mutex_unlock(&mtx);\n```\n\n**为什么要传互斥锁**：\n\n`pthread_cond_wait` 内部做了三件**原子性相关**的事：\n1. **释放互斥锁**\n2. **把自己挂起等待条件变量**\n3. 被唤醒后**重新获取互斥锁**再返回\n\n第 1、2 步必须是**原子的**。如果分开做——先解锁，再挂起——那么在这两步中间，生产者可能刚好拿到锁、设置了条件、发出了 signal。此时消费者还没挂起，**这个 signal 就丢了**，消费者随后挂起，然后永远等下去。这就是"**丢失唤醒**"问题。\n\n把互斥锁交给 cond_wait，就是让它在内部原子地完成"解锁 + 挂起"。\n\n**为什么用 while 而不是 if（同样重要）**：\n\n1. **虚假唤醒（Spurious Wakeup）**：POSIX 明确允许 cond_wait 在没有 signal 的情况下返回。这是为了让实现能在某些平台上更高效。\n2. **多消费者竞争**：`pthread_cond_broadcast` 唤醒了所有等待者，但可能只有一份数据。第一个抢到锁的消费掉了，其余的醒来时条件已经不成立。\n\n所以**被唤醒后必须重新检查条件**，`while` 是唯一正确的写法。用 `if` 的代码在低负载下可能永远不出问题，一上压力就偶发异常——非常难查。\n\n**signal vs broadcast**：\n- `signal` 唤醒**至少一个**等待者，效率高\n- `broadcast` 唤醒**所有**等待者\n- 不确定时用 broadcast 更安全（配合 while 检查条件），确定只有一个等待者能处理时用 signal',
  followup: ['什么是虚假唤醒？为什么标准允许它存在？', 'signal 和 broadcast 分别在什么场景用？', 'pthread_cond_timedwait 的超时时间为什么要用绝对时间？']
},
{
  id: 'lxa-007', cat: 'linux-app', type: 'qa', level: 2, tags: ['共享内存'],
  q: '共享内存怎么用？为什么说它最快但也最危险？',
  a: '**POSIX 共享内存的用法**：\n```c\n/* 进程 A */\nint fd = shm_open("/myshm", O_CREAT | O_RDWR, 0666);\nftruncate(fd, SIZE);\nvoid *p = mmap(NULL, SIZE, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);\n\n/* 进程 B：同样 shm_open + mmap 就能访问同一块物理内存 */\n```\n\n**为什么最快**：\n其他 IPC（管道、消息队列、socket）的数据流是 `用户态A → 内核缓冲 → 用户态B`，**至少两次拷贝**，还有系统调用的上下文切换。共享内存**只在建立映射时有开销**，之后读写就是普通的内存访问，**零拷贝、零系统调用**。\n\n**为什么危险**：\n\n1. **完全没有同步机制**。内核只负责把同一块物理内存映射到两个进程，读写竞争完全由你自己处理。必须配合：\n   - **POSIX 信号量**（`sem_open`，可跨进程）\n   - **进程间互斥锁**（pthread_mutex 设置 `PTHREAD_PROCESS_SHARED` 属性，并把锁本身也放在共享内存里）\n   - 单生产者单消费者时可用无锁环形缓冲\n\n2. **没有消息边界**。写进去的是裸内存，接收方怎么知道数据写完了？必须自己设计协议（长度字段、就绪标志、序列号）。\n\n3. **进程崩溃后状态不确定**。一个进程持有锁时崩溃，锁永远不会释放，另一个进程死等。**这是共享内存最麻烦的问题**。缓解手段是用 **robust mutex**（`PTHREAD_MUTEX_ROBUST`），持有者死亡时下一个加锁者会收到 `EOWNERDEAD`，可以做恢复。\n\n4. **不能用指针**。同一块共享内存在两个进程里的**虚拟地址通常不同**，存进去的指针在对方进程里是无效的。必须用**相对偏移量**代替指针。这是自己实现共享内存数据结构时最容易踩的坑。\n\n5. **生命周期管理**。`shm_open` 创建的对象在 `/dev/shm/` 下持久存在，进程退出不会自动删除，需要显式 `shm_unlink`。忘了清理会泄漏。\n\n**什么时候值得用**：数据量大（视频帧、音频缓冲、大数组）且交换频繁。小数据量、低频通信用 socket 更省心——**为了省几微秒引入一类难查的并发 bug 通常不划算**。',
  followup: ['为什么共享内存里不能存指针？', 'robust mutex 怎么用？', '进程崩溃后共享内存里的数据怎么恢复？'],
},
{
  id: 'lxa-008', cat: 'linux-app', type: 'single', level: 2, tags: ['信号'],
  q: '信号处理函数里可以安全调用的函数称为？',
  options: [
    '可重入函数',
    '异步信号安全（async-signal-safe）函数',
    '线程安全函数',
    '原子函数'
  ],
  answer: [1],
  a: '**异步信号安全（async-signal-safe）函数。**\n\n信号可以在**任意时刻**打断主流程，包括打断某个函数执行到一半的时候。如果信号处理函数里又调用了同一个函数，而这个函数正处于不一致状态（比如 malloc 正在修改堆的链表），就会破坏数据结构。\n\n**POSIX 规定了一份安全函数清单**（`man 7 signal-safety`），常用的有：`write`、`read`、`_exit`、`signal`、`kill`、`sigaction`、`时间相关的部分函数`。\n\n**明确不安全的**（但经常被误用）：\n- **printf / fprintf** —— 操作 FILE 缓冲，不可重入。**在信号处理函数里 printf 是最常见的错误做法**\n- **malloc / free** —— 操作堆链表\n- 大部分标准库函数\n\n**正确的信号处理写法**：处理函数里**只做最简单的事，把实际工作交给主流程**：\n\n```c\nvolatile sig_atomic_t g_quit = 0;\n\nvoid handler(int sig) {\n    g_quit = 1;                        /* 只设标志 */\n}\n\n/* 主循环 */\nwhile (!g_quit) { do_work(); }\ncleanup();\n```\n\n注意标志的类型必须是 **`volatile sig_atomic_t`**——保证读写是原子的，且不被编译器优化掉。\n\n**更现代的做法：signalfd**\n```c\nsigset_t mask;\nsigemptyset(&mask); sigaddset(&mask, SIGTERM);\nsigprocmask(SIG_BLOCK, &mask, NULL);   /* 先阻塞，避免默认处理 */\nint sfd = signalfd(-1, &mask, 0);\n/* 现在 sfd 可以放进 epoll，信号变成了普通的可读事件 */\n```\n把信号转成文件描述符，**在主事件循环里同步处理**，彻底绕开异步信号安全的所有麻烦。事件驱动架构里强烈推荐这个做法。\n\n**另一个要点**：被信号打断的慢速系统调用会返回 `EINTR`，代码里要处理重试（或者用 `sigaction` 时设 `SA_RESTART` 让内核自动重启）。',
  followup: ['为什么标志变量要用 volatile sig_atomic_t？', 'signalfd 相比传统信号处理有什么优势？', 'EINTR 是怎么产生的？怎么处理？'],
},
{
  id: 'lxa-009', cat: 'linux-app', type: 'qa', level: 2, tags: ['串口', 'termios'],
  q: 'Linux 下怎么操作串口？termios 里有哪些容易踩的坑？',
  a: '**基本流程**：\n```c\nint fd = open("/dev/ttyS0", O_RDWR | O_NOCTTY | O_NONBLOCK);\n\nstruct termios tty;\ntcgetattr(fd, &tty);\n\ncfsetispeed(&tty, B115200);\ncfsetospeed(&tty, B115200);\n\ncfmakeraw(&tty);              /* 关键：设成原始模式 */\n\ntty.c_cflag |= (CLOCAL | CREAD);\ntty.c_cflag &= ~CSTOPB;       /* 1 位停止位 */\ntty.c_cflag &= ~PARENB;       /* 无校验 */\ntty.c_cflag &= ~CRTSCTS;      /* 无硬件流控 */\n\ntty.c_cc[VMIN]  = 0;          /* 读取的最小字节数 */\ntty.c_cc[VTIME] = 10;         /* 超时，单位 0.1 秒 */\n\ntcsetattr(fd, TCSANOW, &tty);\ntcflush(fd, TCIOFLUSH);       /* 清掉缓冲区里的残留 */\n```\n\n**常见的坑**：\n\n**1. 忘了设原始模式（最大的坑）**\n默认是"规范模式（canonical mode）"，内核会做一堆处理：\n- 按行缓冲，**读不到完整一行就不返回**\n- 把 `\\r` 转成 `\\n`（ICRNL）\n- 把 `0x11/0x13` 当成软件流控字符吃掉（IXON）\n- 遇到 `0x1A`（Ctrl-Z）等控制字符做特殊处理\n\n**传二进制数据时这些处理会把数据改得面目全非**。`cfmakeraw()` 一次性关掉所有这些行为，是操作二进制协议的必需步骤。\n\n**2. VMIN 和 VTIME 的组合语义**（很多人搞不清）\n| VMIN | VTIME | 行为 |\n|---|---|---|\n| 0 | 0 | **完全非阻塞**，有多少读多少，立即返回 |\n| 0 | >0 | 等待数据，最多等 VTIME×0.1 秒 |\n| >0 | 0 | **阻塞**直到读满 VMIN 个字节 |\n| >0 | >0 | 读到第一个字节后开始计时，字节间隔超过 VTIME 就返回 |\n\n最后一种（**字节间超时**）特别适合读不定长的协议帧。\n\n**3. O_NOCTTY**\n不加的话，如果这个串口是控制终端，进程会被它控制——终端上的 Ctrl-C 会把你的程序杀掉。\n\n**4. read 可能返回不完整的数据**\n串口是字节流，一帧协议数据可能分几次 read 才收全。**必须自己做帧组装**：状态机 + 帧头 + 长度 + 校验。直接 `read` 一次就当一帧处理是初学者最常见的错误。\n\n**5. RS485 方向控制**\n如果外面接的是 RS485 收发器，需要在发送前后切换 DE 引脚。用 `TIOCSRS485` ioctl（内核支持自动控制）或者手动操作 GPIO——手动的话要用 `tcdrain()` 确保数据真的发完了再切方向。\n\n**6. 波特率非标准值**：`B115200` 这类宏只覆盖标准波特率，非标值要用 `TCSETS2` ioctl 配合 `BOTHER`。',
  followup: ['VMIN/VTIME 怎么配合实现字节间超时？', '怎么在应用层做串口帧组装？', 'RS485 的方向控制在 Linux 下怎么做？'],
  resume: true
},
{
  id: 'lxa-010', cat: 'linux-app', type: 'qa', level: 2, tags: ['交叉编译'],
  q: '什么是交叉编译？交叉编译时常见的问题有哪些？',
  a: '**交叉编译**：在一台机器（**host**，通常是 x86 Linux）上，编译出能在另一种架构（**target**，如 ARM）上运行的程序。\n\n**工具链命名规则**：`arch-vendor-os-abi-gcc`\n- `arm-linux-gnueabihf-gcc`：ARM 架构、Linux 系统、GNU EABI、**hf = 硬浮点**\n- `arm-none-eabi-gcc`：ARM 架构、**无操作系统（裸机）**、EABI\n- `aarch64-linux-gnu-gcc`：64 位 ARM\n\n**常见问题**：\n\n**1. 误用了主机的头文件和库**\n最典型的错误。`#include <stdio.h>` 找到了 `/usr/include/stdio.h`（x86 的），链接时又链到了 x86 的库。**症状是能编译过但运行时报 "cannot execute binary file" 或段错误。**\n用 `--sysroot` 指定目标根文件系统，或者确保工具链自带的 sysroot 优先。\n\n**2. 硬浮点 / 软浮点 ABI 不匹配**\n`gnueabi`（软浮点）和 `gnueabihf`（硬浮点）编出的库**不能混用**，链接时报错或运行时崩溃。整个系统的所有库必须统一。\n\n**3. 第三方库要交叉编译**\n不能直接用 apt 装 x86 的库。要么自己交叉编译，要么用 Buildroot / Yocto 这类构建系统统一管理。\n\n**4. configure 脚本的坑**\nautotools 项目要指定 `--host=arm-linux-gnueabihf`。configure 里的运行时检测（尝试运行编译出的测试程序）在交叉编译时会失败，需要用 `cache` 文件预设结果。\n\n**5. CMake 需要 toolchain 文件**\n```cmake\nset(CMAKE_SYSTEM_NAME Linux)\nset(CMAKE_SYSTEM_PROCESSOR arm)\nset(CMAKE_C_COMPILER   arm-linux-gnueabihf-gcc)\nset(CMAKE_CXX_COMPILER arm-linux-gnueabihf-g++)\nset(CMAKE_FIND_ROOT_PATH ${SYSROOT})\nset(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)   /* 程序在 host 上找 */\nset(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)    /* 库只在 sysroot 找 */\nset(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)\n```\n那三个 `FIND_ROOT_PATH_MODE` 是关键，防止 find_package 找到主机的库。\n\n**6. 动态库版本不匹配**\n目标板上的 glibc 版本比编译时用的低，运行报 `GLIBC_2.xx not found`。要么用板子上匹配的工具链，要么静态链接。\n\n**验证手段**：\n```bash\nfile ./myapp                    # 确认是 ARM 可执行文件\narm-linux-gnueabihf-readelf -d ./myapp   # 看依赖哪些动态库\n```\n**编译完先 `file` 一下**，能省掉很多"为什么跑不起来"的困惑。',
  followup: ['sysroot 是什么？为什么必须指定？', '怎么排查动态库依赖缺失？', 'Buildroot 和 Yocto 有什么区别？'],
  resume: true
},
{
  id: 'lxa-011', cat: 'linux-app', type: 'single', level: 2, tags: ['库'],
  q: '静态库（.a）和动态库（.so）的主要区别是？',
  options: [
    '静态库在编译时被复制进可执行文件；动态库在运行时加载，多个程序可共享同一份',
    '静态库更快，动态库更慢，其他没区别',
    '静态库只能用于 C，动态库只能用于 C++',
    '动态库不需要头文件'
  ],
  answer: [0],
  a: '**A。核心区别是链接时机和共享方式。**\n\n| | 静态库 .a | 动态库 .so |\n|---|---|---|\n| 链接时机 | 编译链接时并入可执行文件 | 运行时由动态链接器加载 |\n| 可执行文件大小 | **大** | 小 |\n| 内存占用 | 每个进程一份 | **多进程共享同一份代码段** |\n| 更新 | 必须重新编译整个程序 | **只换 .so 即可** |\n| 部署 | 单文件，无依赖 | 需要保证 .so 存在且版本匹配 |\n| 启动速度 | 略快 | 有动态链接开销 |\n\n**嵌入式里的取舍**：\n\n**倾向静态库**的情况：\n- **Flash 小但只有一两个程序**。虽然单个文件大，但省掉了动态链接器和库的重复\n- 要求**部署简单、无依赖**（单文件拷过去就能跑）\n- 对**启动时间**敏感\n- 需要**确定性**（不会因为板子上的库版本不同而行为变化）\n\n**倾向动态库**的情况：\n- **多个程序共用同一批库**，共享能显著省 Flash 和 RAM\n- 需要**单独升级某个模块**而不重刷整个系统\n- 用了 LGPL 协议的库（静态链接有法律要求）\n\n**实践中的几个要点**：\n1. **链接顺序**：静态库链接时，`gcc main.o -lfoo -lbar`，被依赖的库要放在后面。顺序错了会报未定义符号\n2. **`-fPIC`**：动态库必须用位置无关代码编译\n3. **运行时找不到 .so**：设置 `LD_LIBRARY_PATH`，或编译时用 `-Wl,-rpath`，或放到 `/lib`、`/usr/lib`\n4. **查依赖**：`ldd ./app` 看动态库依赖；交叉编译的程序用 `readelf -d`\n5. **`dlopen`**：可以在运行时按需加载 .so，实现插件机制',
  followup: ['为什么动态库必须用 -fPIC 编译？', '静态库的链接顺序为什么重要？', 'dlopen 实现插件机制要注意什么？']
},
{
  id: 'lxa-012', cat: 'linux-app', type: 'qa', level: 2, tags: ['内存'],
  q: 'Linux 进程的虚拟内存布局是怎样的？malloc 申请的内存来自哪里？',
  a: '**32 位 Linux 的典型布局（从高地址到低地址）**：\n```\n0xFFFFFFFF ┌────────────────┐\n           │  内核空间 1GB   │  用户态不可访问\n0xC0000000 ├────────────────┤\n           │  栈（向下增长） │  局部变量、函数调用帧\n           ├────────────────┤\n           │       ↓        │\n           │  mmap 区域      │  动态库、大块 mmap 内存\n           │       ↑        │\n           ├────────────────┤\n           │  堆（向上增长） │  malloc\n           ├────────────────┤\n           │  .bss          │  未初始化全局/静态变量\n           ├────────────────┤\n           │  .data         │  已初始化全局/静态变量\n           ├────────────────┤\n           │  .text/.rodata │  代码和常量\n0x08048000 └────────────────┘\n0x00000000  （前面一段不映射，用于捕获空指针）\n```\n\n**malloc 的两种来源**：\n1. **小块（默认 < 128KB）**：从堆里分配，堆不够时用 **`brk`/`sbrk`** 系统调用移动堆顶\n2. **大块（≥ MMAP_THRESHOLD，默认 128KB）**：直接用 **`mmap`** 匿名映射一块独立区域，free 时用 `munmap` 直接还给系统\n\n这个阈值可以用 `mallopt(M_MMAP_THRESHOLD, ...)` 调整。\n\n**几个重要认知**：\n\n1. **free 不一定把内存还给操作系统**。小块 free 后只是归还给 glibc 的空闲链表，供下次 malloc 复用。所以 **free 之后 `top` 里看到的 RSS 可能不降**——这不是内存泄漏。\n\n2. **malloc 返回成功不代表物理内存已分配**。Linux 默认**过度提交（overcommit）**，只建立虚拟地址映射，**真正访问时才通过缺页中断分配物理页**。所以 malloc 成功但写入时 OOM 是可能的。\n\n3. **VSZ vs RSS**：`VSZ` 是虚拟地址空间大小（包括没实际占用物理内存的部分），`RSS` 是实际驻留的物理内存。**看内存占用要看 RSS**。\n\n4. **内存碎片**：长期运行的服务反复申请释放不同大小的块，堆会碎片化。表现是 RSS 一直涨但实际用量没涨。缓解：用内存池、固定大小的对象池、或者定期重启（不优雅但有效）。\n\n**嵌入式的实际建议**：内存紧张的设备上，**关键路径避免动态分配**，启动时一次性分配好所有缓冲区。这样内存用量确定，也不会有碎片和分配失败的问题。',
  followup: ['什么是 overcommit？怎么关闭？', '为什么 free 之后 RSS 不下降？', 'OOM Killer 是怎么选择杀哪个进程的？'],
},
{
  id: 'lxa-013', cat: 'linux-app', type: 'qa', level: 2, tags: ['调试', 'strace'],
  q: '程序在目标板上跑不起来或行为异常，有哪些调试手段？',
  a: '**1. 先确认基本环境**\n```bash\nfile ./app                  # 架构对不对\nreadelf -d ./app            # 依赖哪些动态库\nldd ./app                   # 库能不能找到（目标板上运行）\n```\n"cannot execute binary file" 通常就是架构不匹配。\n\n**2. strace —— 看系统调用**\n```bash\nstrace ./app                       # 全部\nstrace -e trace=open,read,write ./app   # 只看文件操作\nstrace -f -p <pid>                 # 跟踪已运行的进程及其子进程\nstrace -T -tt ./app                # 带时间戳和耗时\n```\n**这是排查"程序卡住了"和"打不开文件"最有效的工具**。能直接看到卡在哪个系统调用上、哪个路径打不开、返回什么错误码。\n\n**3. ltrace —— 看库函数调用**\n比 strace 更上层，能看到 malloc、printf 这类调用。\n\n**4. gdb / gdbserver 远程调试**\n```bash\n# 目标板\ngdbserver :2345 ./app\n# 主机\narm-linux-gnueabihf-gdb ./app\n(gdb) target remote 192.168.1.100:2345\n```\n注意主机上要有**带调试符号的版本**（目标板上可以放 strip 过的）。\n\n**5. core dump 事后分析**\n```bash\nulimit -c unlimited\necho "/tmp/core.%e.%p" > /proc/sys/kernel/core_pattern\n# 崩溃后\ngdb ./app /tmp/core.app.1234\n(gdb) bt          # 看调用栈\n(gdb) info locals # 看局部变量\n```\n**偶发崩溃必须靠 core dump**，这是最有价值的手段。嵌入式上注意 core 文件可能很大，要限制大小或存到外部存储。\n\n**6. valgrind —— 内存问题**\n检测越界、泄漏、use-after-free。缺点是**慢 10~50 倍**，且需要交叉编译版本。轻量替代是编译时开 **ASan（`-fsanitize=address`）**，慢约 2 倍，很多问题也能抓到。\n\n**7. /proc 文件系统**\n```bash\ncat /proc/<pid>/status      # 内存、线程数、状态\ncat /proc/<pid>/maps        # 内存映射\nls -l /proc/<pid>/fd        # 打开的文件描述符（查 fd 泄漏）\ncat /proc/<pid>/stack       # 内核栈（卡在内核态时有用）\n```\n\n**8. 日志**\n最朴素但最实用。注意 **printf 有缓冲**，崩溃前的日志可能丢，用 `fflush` 或 stderr。生产环境用 syslog + 日志轮转。\n\n**9. dmesg**\n看内核日志。段错误、OOM Kill、驱动报错都在这里。程序莫名其妙消失时**第一个该看 dmesg**——很可能是被 OOM Killer 杀了。\n\n**排查顺序建议**：dmesg → strace → 日志 → core dump → gdb 单步。从代价低的开始。',
  followup: ['怎么配置 core dump 到指定路径？', 'ASan 和 valgrind 各适合什么场景？', '程序莫名消失，怎么确认是不是被 OOM Killer 杀的？']
},
{
  id: 'lxa-014', cat: 'linux-app', type: 'single', level: 2, tags: ['mmap'],
  q: 'mmap 在嵌入式 Linux 里最典型的用途是？',
  options: [
    '加快文件读写速度',
    '把设备的物理内存/寄存器映射到用户空间，让应用直接访问硬件',
    '分配大块内存',
    '实现多线程'
  ],
  answer: [1],
  a: '**B 是嵌入式里最有特色的用途**（其他几项 mmap 也能做，但不是"最典型"）。\n\n**通过 /dev/mem 直接访问物理地址**：\n```c\nint fd = open("/dev/mem", O_RDWR | O_SYNC);\nvolatile uint32_t *gpio = mmap(NULL, 0x1000, PROT_READ | PROT_WRITE,\n                               MAP_SHARED, fd, GPIO_PHYS_BASE);\ngpio[GPIO_DR / 4] |= (1 << 5);    /* 直接操作寄存器 */\n```\n这样应用层不写驱动就能直接操作硬件，**调试和快速验证时非常方便**。\n\n**注意事项**：\n- 需要 **root 权限**\n- 映射的偏移量必须**页对齐**（4KB），所以要先把基址对齐再加偏移\n- 必须加 `O_SYNC` 保证映射区不被缓存\n- 指针要用 `volatile`\n- **很多现代内核开启了 `CONFIG_STRICT_DEVMEM`，限制了 /dev/mem 能访问的范围**，这时要用 `/dev/uio` 或写正规驱动\n\n**其他重要用途**：\n\n1. **驱动提供的 mmap 接口**：驱动实现 `file_operations.mmap`，把 DMA 缓冲区映射给用户空间。**视频采集（V4L2）、显示（framebuffer）必用**——每帧几 MB 的数据如果用 read/write 拷贝，CPU 全耗在搬数据上了。\n\n2. **文件映射**：把文件映射到内存，像访问数组一样访问文件内容，避免 read/write 的用户态-内核态拷贝。适合随机访问大文件。\n\n3. **进程间共享内存**：`MAP_SHARED` + `MAP_ANONYMOUS`（父子进程）或映射同一文件（任意进程）。\n\n4. **匿名映射代替 malloc**：申请大块内存时 glibc 内部就是这么做的。\n\n**mmap 的核心价值是"零拷贝"**：数据不经过用户态和内核态之间的复制，对高吞吐场景（视频、音频、网络）意义重大。',
  followup: ['为什么 mmap 能做到零拷贝？', 'V4L2 的 mmap 方式采集视频是怎么工作的？', 'CONFIG_STRICT_DEVMEM 限制了什么？'],
},
{
  id: 'lxa-015', cat: 'linux-app', type: 'qa', level: 2, tags: ['守护进程'],
  q: '怎么写一个守护进程（daemon）？现代 Linux 上还需要自己写吗？',
  a: '**传统的守护进程创建步骤**：\n\n1. **fork 后父进程退出**。让子进程成为孤儿被 init 收养，同时保证子进程不是进程组组长（下一步需要）。\n2. **setsid()** 创建新会话。脱离控制终端，从此终端的 Ctrl-C、挂断信号影响不到它。\n3. **再次 fork 并退出父进程**（可选但推荐）。保证进程不是会话组长，**永远无法重新获取控制终端**。\n4. **chdir("/")**。避免占着某个目录导致该目录所在的文件系统无法卸载。\n5. **umask(0)**。清除继承来的文件权限掩码。\n6. **关闭所有继承的文件描述符**，把 0/1/2 重定向到 `/dev/null`（否则往 stdout 写会出错）。\n7. **打开 syslog** 记录日志。\n\n**现代做法：不要自己写**。\n\n用 **systemd** 管理，程序本身写成普通的前台程序即可：\n```ini\n[Unit]\nDescription=My Service\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=/usr/bin/myapp\nRestart=always\nRestartSec=5\nWatchdogSec=30\n\n[Install]\nWantedBy=multi-user.target\n```\n\n**systemd 的好处（这才是重点）**：\n- **自动重启**（`Restart=always`），崩溃后自己拉起来\n- **看门狗**（`WatchdogSec`）：程序要周期性调 `sd_notify(0, "WATCHDOG=1")`，不喂就重启。**相当于给应用层加了看门狗**\n- **日志自动收集**到 journald，stdout/stderr 直接就是日志\n- **依赖管理**：等网络就绪后再启动\n- **资源限制**：内存上限、CPU 配额（基于 cgroup）\n- **启动顺序和并行启动**\n\n**嵌入式上的选择**：\n- 资源充足、用 Yocto/Buildroot 且已启用 systemd → 直接用 systemd\n- 极简系统用 BusyBox init 或 **procd（OpenWrt）** → 可能还是要写传统 daemon，或者用 `start-stop-daemon`\n- 无论哪种，**进程监控和自动重启是必须有的**，不能指望程序永不崩溃\n\n面试时能说"现在一般交给 systemd，自己写 daemon 是历史做法"，比背七个步骤更能体现工程认知。',
  followup: ['为什么要 fork 两次？', 'systemd 的 Type=simple / forking / notify 有什么区别？', 'sd_notify 看门狗怎么用？']
},
{
  id: 'lxa-016', cat: 'linux-app', type: 'qa', level: 2, tags: ['时间'],
  q: 'Linux 下获取时间有哪些接口？做超时判断应该用哪个？',
  a: '**几个常用接口**：\n\n| 接口 | 时钟源 | 特点 |\n|---|---|---|\n| `time()` | 墙上时钟 | 秒级精度，太粗 |\n| `gettimeofday()` | 墙上时钟 | 微秒级，**已废弃** |\n| `clock_gettime(CLOCK_REALTIME)` | 墙上时钟 | 纳秒级，**会被 NTP 和手动改时间影响** |\n| `clock_gettime(CLOCK_MONOTONIC)` | 单调时钟 | **从开机起单调递增，不受改时间影响** |\n| `clock_gettime(CLOCK_MONOTONIC_RAW)` | 单调时钟 | 不受 NTP 频率调整影响 |\n| `clock_gettime(CLOCK_BOOTTIME)` | 单调时钟 | 包含系统挂起（suspend）的时间 |\n\n**做超时判断必须用 `CLOCK_MONOTONIC`**：\n```c\nstruct timespec start, now;\nclock_gettime(CLOCK_MONOTONIC, &start);\n...\nclock_gettime(CLOCK_MONOTONIC, &now);\nlong elapsed_ms = (now.tv_sec - start.tv_sec) * 1000\n                + (now.tv_nsec - start.tv_nsec) / 1000000;\n```\n\n**为什么不能用 REALTIME**：墙上时钟可能被 NTP 校准、被用户手动修改、被 RTC 同步。假如你在等一个 5 秒超时，中途 NTP 把时间往前调了 1 小时，你的超时判断立刻"到期"了；往后调则永远等不到。\n\n**这在嵌入式上尤其常见**：很多设备没有 RTC 电池，**开机时系统时间是 1970 年，联网后 NTP 一下子跳到当前时间**——所有基于 REALTIME 的超时逻辑瞬间全部触发。这是个真实且高频的坑。\n\n**其他要点**：\n- **`pthread_cond_timedwait` 默认用 REALTIME**，可以通过 `pthread_condattr_setclock(&attr, CLOCK_MONOTONIC)` 改成单调时钟。**不改的话条件变量的超时也会受改时间影响。**\n- **睡眠**：优先用 `clock_nanosleep()` 并指定 `CLOCK_MONOTONIC`；`sleep`/`usleep` 精度差且会被信号打断（返回剩余时间，需要处理 EINTR 重试）\n- **定时器**：`timerfd_create(CLOCK_MONOTONIC, ...)` 创建的 fd 能放进 epoll，和其他 IO 事件统一处理，是事件驱动架构里的标准做法\n- **打日志时间戳用 REALTIME**（人要看懂），**计算间隔用 MONOTONIC**',
  followup: ['为什么 pthread_cond_timedwait 默认用 REALTIME 是个陷阱？', 'timerfd 相比传统定时器有什么优势？', '设备没有 RTC 时怎么处理时间？'],
},
{
  id: 'lxa-017', cat: 'linux-app', type: 'qa', level: 3, tags: ['实时性', 'PREEMPT_RT'],
  q: '标准 Linux 能做硬实时吗？有哪些提升实时性的手段？',
  a: '**标准 Linux 不是硬实时系统。** 主要障碍：\n- 内核中有大量**不可抢占的临界区**，高优先级任务可能被内核代码延迟\n- 中断处理、软中断（softirq）优先级高于所有用户任务\n- 页面换入换出、缺页中断带来不确定延迟\n- CFS 调度器面向吞吐量和公平性，不保证时限\n\n典型的调度延迟：标准内核最坏可能到**几毫秒甚至几十毫秒**。\n\n**提升手段（由浅入深）**：\n\n**1. 实时调度策略**\n```c\nstruct sched_param p = { .sched_priority = 80 };\npthread_setschedparam(tid, SCHED_FIFO, &p);\n```\n- `SCHED_FIFO`：**同优先级下先到先跑，不主动让出就一直占着 CPU**\n- `SCHED_RR`：同优先级轮转\n- 优先级 1~99，高于所有 `SCHED_OTHER` 任务\n- **危险**：优先级设太高且死循环，会把系统卡死（内核有 `sched_rt_runtime_us` 限制，默认给非实时任务留 5%）\n\n**2. 锁定内存，避免缺页**\n```c\nmlockall(MCL_CURRENT | MCL_FUTURE);\n```\n把进程的内存锁在物理内存里，避免运行时缺页中断带来的不确定延迟。**实时程序必做。**同时要**预先分配并触摸所有需要的内存**（包括预热栈）。\n\n**3. 避免动态内存和不确定操作**\n实时路径上不 malloc、不 printf、不做文件 IO。\n\n**4. CPU 隔离与绑定**\n- 内核参数 `isolcpus=2,3` 把某些核从通用调度中隔离出来\n- `taskset` / `pthread_setaffinity_np` 把实时线程绑到隔离的核上\n- 把中断亲和性（`/proc/irq/N/smp_affinity`）从这些核上移开\n\n**5. PREEMPT_RT 补丁（终极方案）**\n把内核改造成几乎完全可抢占：\n- 把大部分自旋锁换成可睡眠的 **rt_mutex**（带优先级继承）\n- **中断处理线程化**，可以被更高优先级的实时任务抢占\n- 结果：最坏调度延迟能压到**几十微秒**\n- **代价**：整体吞吐量下降（约 5~10%），需要打补丁或用已合入 RT 的新内核（6.12 起主线已包含）\n\n**测量工具**：`cyclictest` 是事实标准，测量定时器唤醒的实际延迟分布，看最大值而不是平均值。\n\n**现实建议**：\n- 微秒级硬实时（电机换相、精密时序）→ **不要用 Linux**，用 MCU 或 FPGA，或者 Linux + 协处理器（如 i.MX 的 Cortex-M 核、TI 的 PRU）的异构方案\n- 毫秒级软实时 → 标准 Linux + SCHED_FIFO + mlockall 通常够用\n- 亚毫秒级 → PREEMPT_RT',
  followup: ['cyclictest 怎么用？看哪个指标？', 'PREEMPT_RT 是怎么让内核可抢占的？', '异构方案（Linux + MCU 核）怎么做核间通信？'],
},
{
  id: 'lxa-018', cat: 'linux-app', type: 'single', level: 1, tags: ['文件描述符'],
  q: '关于文件描述符，说法错误的是？',
  options: [
    '0、1、2 分别是标准输入、标准输出、标准错误',
    'fork 出的子进程会继承父进程的文件描述符',
    '文件描述符是进程级的资源，有数量上限',
    '进程退出后文件描述符需要手动关闭，否则会一直泄漏'
  ],
  answer: [3],
  a: '**D 错。进程退出时内核会自动关闭所有文件描述符**，不会跨进程泄漏。\n\n但**进程运行期间的 fd 泄漏是真实存在且危害很大的问题**：长期运行的服务如果每次打开文件/socket 都不关，fd 数量持续增长，达到上限后所有 `open`、`accept`、`socket` 都会失败（`EMFILE`）。表现是"跑几天之后就连不上了"。\n\n**排查 fd 泄漏**：\n```bash\nls -l /proc/<pid>/fd | wc -l        # 当前打开数量\nls -l /proc/<pid>/fd                # 看具体打开了什么\ncat /proc/<pid>/limits              # 看上限\nlsof -p <pid>                       # 更详细\n```\n**周期性采样这个数字，如果单调增长就是泄漏。**\n\n**其他三项都对，补充几点**：\n\n- **fd 是进程级的**，上限由 `ulimit -n`（软限制）和 `/proc/sys/fs/nr_open`（硬上限）控制。默认常见值是 1024，服务器程序通常要调大。\n\n- **fork 继承 fd**：子进程和父进程**共享同一个文件表项**，包括文件偏移量。这意味着父子进程读同一个文件会互相影响偏移。\n\n- **exec 时的行为**：默认 fd 会被继承到新程序。想避免要设置 **`FD_CLOEXEC`** 标志（或者 open 时用 `O_CLOEXEC`）。**这是个安全和资源管理的要点**——否则你 fork+exec 启动的子程序会莫名其妙持有一堆你的 socket 和文件，既浪费资源又可能泄漏敏感句柄。多线程程序里更推荐直接用 `O_CLOEXEC`，避免 open 和 fcntl 之间的竞态。\n\n- **dup/dup2**：复制 fd，实现重定向的基础。`dup2(fd, 1)` 就是把标准输出重定向到 fd。',
  followup: ['O_CLOEXEC 解决什么问题？为什么比 fcntl 更好？', 'fork 后父子进程共享文件偏移会有什么问题？', 'fd 泄漏怎么定位到具体代码位置？']
},
{
  id: 'lxa-019', cat: 'linux-app', type: 'qa', level: 2, tags: ['CMake'],
  q: 'CMake 相比 Makefile 有什么优势？一个交叉编译项目的 CMake 怎么组织？',
  a: '**CMake 的优势**：\n- **跨平台**：一份配置生成 Makefile、Ninja、Visual Studio 工程\n- **自动处理依赖**：头文件依赖不用手写\n- **out-of-source 构建**：编译产物和源码分离，清理干净\n- **模块化**：`find_package`、`target_link_libraries` 自动传递依赖（包括头文件路径和编译选项）\n- **生态好**：主流库都提供 CMake 支持\n\nMakefile 的优势是简单直接、无额外依赖，小项目和内核模块仍然常用。\n\n**一个交叉编译项目的组织**：\n```\nproject/\n├── CMakeLists.txt              # 顶层\n├── cmake/\n│   └── arm-linux.cmake         # 工具链文件\n├── src/\n│   ├── CMakeLists.txt\n│   └── main.c\n├── lib/\n│   ├── CMakeLists.txt\n│   └── audio.c\n└── build/                      # 构建目录（不入库）\n```\n\n**顶层 CMakeLists.txt**：\n```cmake\ncmake_minimum_required(VERSION 3.13)\nproject(myapp C)\n\nset(CMAKE_C_STANDARD 11)\nadd_compile_options(-Wall -Wextra)\n\nadd_subdirectory(lib)\nadd_subdirectory(src)\n```\n\n**推荐用 target 级命令而不是全局命令**（现代 CMake 的核心思想）：\n```cmake\nadd_library(audio STATIC audio.c)\ntarget_include_directories(audio PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)\ntarget_link_libraries(audio PRIVATE asound)\n\nadd_executable(myapp main.c)\ntarget_link_libraries(myapp PRIVATE audio)   # 自动继承 audio 的 PUBLIC 头文件路径\n```\n用 `include_directories()` 这类全局命令会污染所有目标，项目大了就乱套。**`PUBLIC`/`PRIVATE`/`INTERFACE` 的区别是现代 CMake 的关键**：PUBLIC 会传递给依赖者，PRIVATE 不会。\n\n**交叉编译**：\n```bash\ncmake -B build -DCMAKE_TOOLCHAIN_FILE=cmake/arm-linux.cmake\ncmake --build build -j8\n```\n工具链文件的内容见"交叉编译"那题。\n\n**几个实用技巧**：\n- `set(CMAKE_EXPORT_COMPILE_COMMANDS ON)` 生成 `compile_commands.json`，**让 clangd/VSCode 能正确索引代码**，交叉编译项目里尤其有用\n- 用 `CMAKE_BUILD_TYPE` 区分 Debug/Release\n- `option()` 定义编译选项，配合 `#cmakedefine` 生成配置头文件',
  followup: ['PUBLIC/PRIVATE/INTERFACE 的区别是什么？', 'compile_commands.json 有什么用？', '怎么用 CMake 管理多个硬件平台的差异？'],
  resume: true
},
{
  id: 'lxa-020', cat: 'linux-app', type: 'qa', level: 2, tags: ['ALSA', '音频'], resume: true,
  q: 'Linux 下用 ALSA 做音频采集和播放，基本流程是什么？延迟和丢帧怎么控制？',
  a: '**基本流程**：\n```c\nsnd_pcm_t *handle;\nsnd_pcm_hw_params_t *params;\n\nsnd_pcm_open(&handle, "default", SND_PCM_STREAM_CAPTURE, 0);\nsnd_pcm_hw_params_malloc(&params);\nsnd_pcm_hw_params_any(handle, params);\n\nsnd_pcm_hw_params_set_access(handle, params, SND_PCM_ACCESS_RW_INTERLEAVED);\nsnd_pcm_hw_params_set_format(handle, params, SND_PCM_FORMAT_S16_LE);\nsnd_pcm_hw_params_set_channels(handle, params, 1);\nsnd_pcm_hw_params_set_rate(handle, params, 16000, 0);\nsnd_pcm_hw_params_set_period_size(handle, params, 320, 0);  /* 20ms @16k */\nsnd_pcm_hw_params_set_buffer_size(handle, params, 320 * 4); /* 4 个 period */\n\nsnd_pcm_hw_params(handle, params);\nsnd_pcm_prepare(handle);\n\nwhile (running) {\n    int n = snd_pcm_readi(handle, buf, 320);\n    if (n == -EPIPE) {          /* overrun：应用读得太慢，数据被覆盖 */\n        snd_pcm_prepare(handle);\n        continue;\n    }\n    process(buf, n);\n}\n```\n\n**核心概念：period 和 buffer**\n- **period（周期）**：硬件每采集/播放完一个 period 就产生一次中断，是应用读写的最小单位\n- **buffer**：由若干个 period 组成的环形缓冲\n- **延迟 ≈ buffer_size / sample_rate**\n\n**延迟与稳定性的权衡（这是关键）**：\n- period 越小 → **延迟越低，但中断越频繁，CPU 开销大，容易来不及处理导致 xrun**\n- buffer 越大 → **抗抖动能力强，但延迟高**\n\n实践中：语音交互场景 period 取 10~20ms，buffer 取 3~4 个 period，端到端延迟控制在几十毫秒。\n\n**xrun（欠载/过载）的处理**：\n- **采集端 overrun**：应用读得太慢，硬件把旧数据覆盖了\n- **播放端 underrun**：应用喂得太慢，硬件没数据可播，出现爆音\n- 两者都返回 `-EPIPE`，必须调 `snd_pcm_prepare()` 恢复\n\n**减少 xrun 的手段**：\n1. **音频线程用实时优先级**（`SCHED_FIFO`），并 `mlockall` 锁内存\n2. **采集/处理/播放解耦**：采集线程只负责读走数据塞进环形缓冲，处理放到另一个线程。**采集线程里绝不做耗时操作**（编码、写文件、网络发送）\n3. 适当增大 buffer\n4. 避免在音频路径上做动态内存分配和日志输出\n\n**其他实用点**：\n- `snd_pcm_readi` 的 `i` 表示 interleaved（交织），多声道数据是 LRLRLR 排列；非交织用 `snd_pcm_readn`\n- 可以用 `snd_pcm_avail_update()` 查询可读/可写量，配合 poll 做非阻塞\n- ALSA 的 `default` 设备通常经过 dmix 插件混音，**延迟比直接用 `hw:0,0` 高**。追求低延迟要用 hw 设备，代价是独占且不能自动重采样\n- 调试：`arecord -D hw:0,0 -f S16_LE -r 16000 -c 1 test.wav` 先用命令行确认硬件通路正常，再写代码',
  followup: ['xrun 发生后除了 prepare 还需要做什么？', 'hw 设备和 plughw 设备有什么区别？', '怎么测量端到端的音频延迟？']
},
{
  id: 'lxa-021', cat: 'linux-app', type: 'qa', level: 2, tags: ['sysfs', 'GPIO'],
  q: '应用层怎么操作 GPIO？sysfs 和 gpiod 有什么区别？',
  a: '**旧方式：sysfs 接口（已废弃）**\n```bash\necho 23 > /sys/class/gpio/export\necho out > /sys/class/gpio/gpio23/direction\necho 1 > /sys/class/gpio/gpio23/value\necho 23 > /sys/class/gpio/unexport\n```\n应用里就是对这些文件做 open/write。\n\n**sysfs 的问题（为什么被废弃）**：\n- **没有所有权概念**：任何进程都能操作同一个 GPIO，一个程序崩溃后 GPIO 状态残留，另一个程序 export 时报"设备忙"\n- **编号全局且不稳定**：GPIO 号依赖于控制器的注册顺序，**内核升级或设备树改动后编号可能变**，代码里硬编码的数字就失效了\n- **效率低**：每次操作都要 open/write/close 文件\n- **中断（边沿检测）支持简陋**：靠 poll `value` 文件的 POLLPRI，语义别扭\n\n**新方式：GPIO 字符设备 + libgpiod**\n```c\n#include <gpiod.h>\nstruct gpiod_chip *chip = gpiod_chip_open_by_name("gpiochip0");\nstruct gpiod_line *line = gpiod_chip_get_line(chip, 23);\ngpiod_line_request_output(line, "myapp", 0);\ngpiod_line_set_value(line, 1);\n```\n或命令行工具：`gpioset gpiochip0 23=1`、`gpioget`、`gpiomon`（监听边沿）、`gpioinfo`（查看所有 GPIO 状态和占用者）。\n\n**libgpiod 的改进**：\n- **有所有权**：line 被某个进程请求后，别的进程拿不到；**进程退出时内核自动释放**，不会留下脏状态\n- **按 chip + offset 定位**，比全局编号稳定；还支持按 name 查找\n- **一次可以操作多条线**（bulk 操作），效率高\n- **事件（中断）机制完善**：`gpiod_line_event_wait` 能拿到带时间戳的边沿事件\n\n**什么时候不该用应用层 GPIO**：\n- 需要**精确时序**（模拟总线协议、驱动 WS2812 这类时序敏感的器件）——用户态受调度影响，抖动可能到毫秒级，必须写内核驱动或用硬件外设（PWM、SPI、PIO）\n- 需要**高频操作**——每次系统调用都有开销\n\n**应用层 GPIO 适合**：低频的控制（继电器、LED 指示、复位信号）和状态读取（按键、检测脚）。这类场景用 libgpiod 最方便，不用写驱动。',
  followup: ['为什么用户态 GPIO 不能做精确时序？', 'gpiomon 怎么监听中断事件？', 'GPIO 编号不稳定会导致什么问题？']
},
{
  id: 'lxa-022', cat: 'linux-app', type: 'qa', level: 2, tags: ['socket', '编程'],
  q: 'TCP socket 编程的基本流程是什么？服务端要注意哪些细节？',
  a: '**基本流程**：\n```\n服务端: socket → bind → listen → accept → read/write → close\n客户端: socket → connect → read/write → close\n```\n\n**服务端容易忽略的细节**：\n\n**1. SO_REUSEADDR**\n```c\nint opt = 1;\nsetsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));\n```\n不设的话，程序重启时 bind 会失败报 "Address already in use"——因为上次的连接还在 **TIME_WAIT** 状态占着端口（要等 2MSL，通常 60 秒）。**这是最常被问也最实用的一个选项。**\n\n**2. accept 返回的是新 fd**\n监听 fd 只用于接受连接，每个客户端对应一个新的 fd。别把两者搞混。\n\n**3. read 返回 0 表示对端关闭**\n```c\nn = read(fd, buf, len);\nif (n == 0)  { /* 对端正常关闭 */ }\nelse if (n < 0) {\n    if (errno == EINTR) continue;        /* 被信号打断，重试 */\n    if (errno == EAGAIN) { /* 非阻塞下无数据 */ }\n    else { /* 真的出错 */ }\n}\n```\n\n**4. write 可能写不完**\nTCP 发送缓冲区满时，`write` 返回**实际写入的字节数**（可能小于请求量），必须循环写：\n```c\nsize_t sent = 0;\nwhile (sent < len) {\n    ssize_t n = write(fd, buf + sent, len - sent);\n    if (n < 0) { if (errno == EINTR) continue; break; }\n    sent += n;\n}\n```\n**假设 write 一次写完是很常见的 bug**，小数据量时看不出来，大数据量或网络拥塞时就丢数据。\n\n**5. 处理 SIGPIPE**\n向已关闭的连接写数据会触发 `SIGPIPE`，**默认行为是终止进程**。必须：\n- `signal(SIGPIPE, SIG_IGN)`，然后靠 write 返回 `EPIPE` 判断，或\n- 用 `send(fd, buf, len, MSG_NOSIGNAL)`\n\n**6. 粘包问题**\nTCP 是**字节流**，没有消息边界。发两次 100 字节，接收方可能一次读到 200 字节，也可能分三次读到。必须在应用层定义消息边界：\n- **长度前缀**（最常用）：`[4字节长度][数据]`\n- **固定长度**消息\n- **分隔符**（如 `\\r\\n`，但数据里不能出现分隔符）\n\n**7. 超时与保活**\n- `SO_RCVTIMEO` / `SO_SNDTIMEO` 设置读写超时\n- **TCP keepalive 默认 2 小时才探测**，太慢。嵌入式设备通常自己实现**应用层心跳**，几秒一次，及时发现断链\n\n**8. 并发模型**\n- 连接少 → 每连接一线程\n- 连接多 → **epoll 事件循环**（推荐，嵌入式资源有限）',
  followup: ['TIME_WAIT 为什么要等 2MSL？', '怎么设计一个带长度前缀的应用层协议？', 'TCP keepalive 的三个参数怎么调？'],
  resume: true
},
{
  id: 'lxa-023', cat: 'linux-app', type: 'single', level: 2, tags: ['文件系统'],
  q: '嵌入式 Linux 中，为什么根文件系统常挂载为只读，另外单独挂一个可写分区？',
  options: [
    '只读文件系统速度更快',
    '防止意外掉电损坏文件系统，同时保护系统文件不被误改；可写数据集中在单独分区，损坏也只影响数据',
    '只读分区占用空间更小',
    '这是内核的强制要求'
  ],
  answer: [1],
  a: '**B。核心是掉电可靠性和系统完整性。**\n\n**嵌入式设备经常是直接断电关机的**（拔电源、点火开关关闭），没有正常的 umount 流程。如果此时文件系统正在写入，元数据可能处于不一致状态，轻则丢文件，重则**整个文件系统损坏导致设备无法启动**。\n\n**只读根文件系统的好处**：\n- 断电时**根本没有写操作在进行**，从物理上杜绝了损坏\n- 系统文件不会被误改或被恶意篡改\n- 便于校验完整性（整个分区做一次哈希就能验证）\n- 多个设备可以共用同一个只读镜像\n\n**典型分区方案**：\n```\n/boot        只读    内核、设备树\n/            只读    squashfs 或 ext4 只读挂载，系统程序\n/data        可写    应用数据、配置、日志\n/tmp, /run   tmpfs   内存文件系统，掉电即失，无所谓\n/var/log     可写或 tmpfs\n```\n\n**可写分区的文件系统选择**：\n- **裸 NAND**：**UBIFS**（自带磨损均衡、坏块管理、掉电保护）或 JFFS2（老，大容量下挂载慢）\n- **eMMC / SD 卡**（有 FTL 层）：**ext4 开 journal**，或 **F2FS**（针对闪存优化）\n- 关键配置文件用**双备份 + CRC + 原子替换**（写临时文件 → fsync → rename），rename 在同一文件系统内是原子的\n\n**其他配套措施**：\n- **overlayfs**：只读的 lower 层 + 可写的 upper 层，让根看起来可写但实际改动都落在可写分区。既保留了只读的可靠性，又兼容需要写系统目录的程序\n- **日志写 tmpfs + 定期落盘**，减少写入频率（也保护闪存寿命）\n- 关键写操作后调 **`fsync()`**，确保数据真的落盘而不是停在页缓存里\n- **A/B 双系统分区**用于 OTA，和 Bootloader 的 A/B 分区是同样的思路',
  followup: ['overlayfs 是怎么工作的？', '为什么 rename 是原子的？怎么用它做安全更新？', 'UBIFS 和 ext4 在 NAND 上各有什么优劣？'],
},
{
  id: 'lxa-024', cat: 'linux-app', type: 'qa', level: 2, tags: ['性能分析'],
  q: '应用 CPU 占用过高，怎么定位是哪里的问题？',
  a: '**第一步：确认是谁在占，占在哪**\n```bash\ntop -H -p <pid>          # 按线程看，找出是哪个线程\nps -eLo pid,tid,pcpu,comm --sort=-pcpu | head\n```\n先定位到线程，范围就小了很多。\n\n**第二步：区分是用户态还是内核态**\n```bash\ntop        # 看 %us（用户态）和 %sy（系统态）的比例\npidstat -u 1\n```\n- **用户态高** → 算法/循环问题，往下用 perf 分析\n- **系统态高** → 系统调用太频繁，用 strace 统计\n\n**第三步（系统态高）：strace 统计系统调用**\n```bash\nstrace -c -p <pid>       # 统计各系统调用的次数和耗时\n```\n常见问题：\n- 忙等轮询（循环里 `read` 非阻塞 fd 但没有 sleep）\n- `select`/`poll` 超时设成 0 导致空转\n- 日志写得太频繁\n- 小块数据频繁读写（没有缓冲）\n\n**第四步（用户态高）：perf 采样**\n```bash\nperf top -p <pid>                 # 实时看热点函数\nperf record -g -p <pid> -- sleep 10\nperf report                       # 看调用图\n```\n`perf` 基于采样，开销很小，能直接告诉你 CPU 时间花在哪个函数上。**这是最直接有效的工具。**\n\n配合 **火焰图** 更直观：\n```bash\nperf record -F 99 -g -p <pid> -- sleep 30\nperf script | stackcollapse-perf.pl | flamegraph.pl > cpu.svg\n```\n\n**第五步：常见的高 CPU 原因**\n1. **忙等循环**：`while(!flag);` 或者轮询间隔太短。改成阻塞等待（条件变量、epoll、信号量）\n2. **算法复杂度**：数据量增长后 O(n²) 的代码暴露\n3. **锁竞争**：自旋锁下的激烈竞争，或者频繁的锁获取释放。用 `perf lock` 或看 futex 系统调用次数\n4. **不必要的内存拷贝**：大数据量的 memcpy\n5. **日志过多**：尤其是格式化 + 同步写盘\n6. **定时器过密**：几十个 1ms 定时器\n7. **软浮点**：无 FPU 平台上的浮点运算，或者编译选项没开硬浮点\n\n**嵌入式的额外注意**：\n- 目标板上可能没有 perf，需要交叉编译或用 Buildroot 打包进去\n- 资源受限时，用 `/proc/<pid>/stat` 自己写个采样脚本也能定位到大致模块\n- **在代码关键路径埋点计时**（clock_gettime + 统计），是最土但最可靠的方法',
  followup: ['怎么生成和解读火焰图？', '锁竞争导致的 CPU 高怎么确认？', '目标板上没有 perf 怎么办？'],
}
]);
