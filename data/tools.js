QBANK.add([
{
  id: 'tool-001', cat: 'tools', type: 'qa', level: 2, tags: ['Git', '分支'],
  q: 'Git 的分支工作流是怎么组织的？merge 和 rebase 有什么区别，什么时候不能 rebase？',
  a: '**merge 和 rebase 的本质区别**：\n\n| | merge | rebase |\n|---|---|---|\n| 历史形态 | 保留分叉，多一个合并节点 | 线性，像是一直在最新代码上开发 |\n| 提交 ID | 原提交不变 | **全部重写**（父提交变了，哈希就变了） |\n| 冲突解决 | 集中一次 | 可能每个提交都要解一次 |\n| 追溯性 | 完整保留「当时基于哪个版本开发」 | 这个信息丢失 |\n\n```bash\n# 把 feature 上的提交搬到 main 最新处重放\ngit checkout feature\ngit rebase main\n\n# 合并回来时就是快进，没有多余的合并节点\ngit checkout main && git merge feature\n```\n\n**铁律：不要 rebase 已经推送出去、别人可能基于它工作的分支。**\n\n原因是 rebase 重写了提交，原来的提交对别人来说凭空消失了。同事再 pull 就会看到一堆莫名冲突，或者把旧提交又带回来，历史变成一团乱麻。所以：\n- **个人未推送的分支** → 随便 rebase,整理干净再推\n- **共享分支(main / develop / 已开 MR 且有人协作的分支)** → 只能 merge\n- 万一必须改已推送的分支，用 `--force-with-lease` 而不是 `--force`(前者会在远端有别人新提交时拒绝，避免覆盖同事的工作)\n\n**实际项目里的常用组合**:开发时用 `git pull --rebase` 拉取(避免为每次同步都产生一个无意义的合并节点),自己的分支合进主干前先 rebase 整理成几个逻辑清晰的提交，最后用 `merge --no-ff` 合入，这样主干上既能看到线性的干净提交，又能通过合并节点看出「这一组提交属于同一个特性」。\n\n**面试加分点**:主动提到 `--force-with-lease`,以及说清「rebase 不是更高级、merge 不是更低级，而是取舍不同」——很多人会答成 rebase 一定更好。',
  followup: ['--force-with-lease 比 --force 安全在哪？', 'merge --no-ff 和普通 merge 有什么区别？', 'git pull --rebase 会带来什么风险？']
},
{
  id: 'tool-002', cat: 'tools', type: 'qa', level: 2, tags: ['Git', '调试'],
  q: '怎么用 git bisect 定位是哪个提交引入了 bug？',
  a: '**原理**：在「已知好的提交」和「已知坏的提交」之间做**二分查找**。N 个提交只需要测约 log2(N) 次——1000 个提交里找问题提交，大约测 10 次就定位了。\n\n```bash\ngit bisect start\ngit bisect bad                # 当前版本是坏的\ngit bisect good v1.2.0        # 这个 tag 是好的\n\n# Git 自动 checkout 到中间某个提交,你编译+测试,然后告诉它结果\ngit bisect good   # 或 git bisect bad\n# ...重复几次...\n# Git 输出:xxxxxx is the first bad commit\n\ngit bisect reset              # 回到原来的分支\n```\n\n**自动化(嵌入式里特别有用)**:写一个脚本，退出码 0 表示好、非 0 表示坏，让 Git 全自动跑完：\n\n```bash\ngit bisect run ./test.sh\n```\n\n对嵌入式来说 `test.sh` 通常是「交叉编译 → 烧录到目标板 → 跑自动化测试 → 返回结果」。如果编译都过不了(这个提交本身是坏的中间状态),脚本应该返回 **125**,Git 会跳过这个提交而不是判定为坏。\n\n**几个实战要点**:\n1. **必须有一个稳定可复现的判定方法**。偶发问题用 bisect 会得出错误结论——这时要么想办法提高复现率，要么每个点多测几次\n2. **注意子模块和构建产物**。切换提交后要 `git submodule update`,并且清理旧的编译产物，否则测的可能不是当前代码\n3. **`git bisect skip`** 用于那些无法测试的提交(编译不过、缺依赖)\n4. **前提是提交粒度要小**。如果一个提交改了 5000 行，bisect 定位到它也帮不上多少忙——这就是为什么要养成小提交的习惯\n\n**面试怎么答才拿分**:除了背命令，说出「125 退出码跳过编译失败的提交」和「bisect 的效果取决于提交粒度」这两点，面试官就知道你真用过。',
  followup: ['为什么脚本要用 125 表示跳过？', '偶发性 bug 能用 bisect 吗？', 'bisect 定位到一个巨大的提交怎么继续查？']
},
{
  id: 'tool-003', cat: 'tools', type: 'single', level: 2, tags: ['Git', '回退'],
  q: '已经 push 到共享分支的一个提交引入了 bug，要撤销它，最合适的做法是？',
  options: [
    'git reset --hard 到上一个提交，然后强制推送',
    'git revert 那个提交，产生一个新的反向提交后推送',
    'git checkout 上一个提交的文件版本后重新提交',
    'git commit --amend 修改那个提交后强制推送'
  ],
  answer: [1],
  a: '**B。共享分支上撤销已推送的提交，唯一安全的做法是 `git revert`。**\n\n`git revert <commit>` 会生成一个**新提交**,内容是目标提交的反向改动。历史只增不改，别人 pull 下来就是一次正常的快进，不会有任何冲突。\n\n**三个概念的区别**:\n\n| 命令 | 作用对象 | 是否改写历史 |\n|---|---|---|\n| `git revert` | 生成反向的**新提交** | 不改写，**共享分支唯一安全选项** |\n| `git reset` | 移动分支指针(`--soft` 保留暂存区，`--mixed` 保留工作区，`--hard` 全丢) | **改写**,只能用于未推送的本地提交 |\n| `git checkout <commit> -- <file>` | 只取某个提交里的**文件内容** | 不动历史，但也不是「撤销提交」 |\n\n**为什么 A 和 D 错**:`reset --hard` + 强推和 `amend` + 强推都**改写了共享历史**。同事本地还有旧提交，再 pull 会产生莫名冲突，甚至把你删掉的提交又带回主干。而且 `--hard` 会直接丢弃工作区的未提交改动，不可恢复。\n\n**为什么 C 错**:它只是把文件内容改回去再提交一次，能凑效但语义不清——没有记录「这是在撤销哪个提交」，后续追溯和 cherry-pick 都会踩坑。`revert` 生成的提交信息里会自动带上原提交的哈希。\n\n**误操作后怎么救：`git reflog`**\n\n```bash\ngit reflog                 # 列出 HEAD 的所有历史位置\ngit reset --hard HEAD@{2}  # 回到两步之前的状态\n```\n\nreflog 记录了本地 HEAD 的每一次移动(默认保留 90 天),**即使提交已经不在任何分支上，对象还在仓库里**。所以 reset --hard 误删提交、rebase 搞乱历史，基本都能靠 reflog 找回。这是 Git 的救命符——**但它只在本地，而且只对「提交过」的内容有效**;从未 `git add` 过的文件被 `reset --hard` 或 `git clean -fd` 删掉，是真的找不回来了。',
  followup: ['reflog 能救回从未 add 过的文件吗？', 'revert 一个 merge 提交要注意什么？', 'reset 的 --soft / --mixed / --hard 分别保留什么？']
},
{
  id: 'tool-004', cat: 'tools', type: 'qa', level: 1, tags: ['Git', '协作'],
  q: 'commit message 该怎么写？为什么强调「小而完整的提交」？',
  a: '**一条好的 commit message 的结构**:\n\n```\nfix(can): 修复 ISO-TP 多帧接收时 FC 帧超时的问题\n\nBS=0 时原代码仍按每帧发送流控帧,导致连续帧之间\n多出 2ms 间隔,大数据量刷写时累积超时。\n改为 BS=0 时只在首帧后发一次 FC。\n\nFixes: #142\n```\n\n- **首行 50 字以内，写「做了什么」而不是「改了哪个文件」**。用祈使句(「修复」而不是「修复了」)\n- 空一行，正文写 **why**:为什么要改、原来为什么不对。**代码本身能说明 what,说不清 why**\n- 关联 issue / 需求编号，方便日后追溯\n\n**反面例子**:`update`、`fix bug`、`修改`、`阶段性提交`、`123`。半年后你自己也看不懂，`git log` 和 `git blame` 直接失去价值。\n\n**为什么「小而完整」很重要**——这不是洁癖，而是**直接影响排查效率**:\n\n1. **`git bisect` 的分辨率就是提交粒度**。定位到一个改了 3000 行、混了重构+新特性+格式化的提交，等于没定位到\n2. **`git blame` 才有意义**。看到某一行是「重构+格式化」那次改的，什么信息都得不到\n3. **`git revert` 才能用**。一个提交里混了「修 bug」和「加新特性」，想撤销 bug 修复就必须连新特性一起撤\n4. **代码评审能真正评审**。3000 行的 MR 只会被点「同意」，300 行的才会被认真看\n\n**「完整」的含义：每个提交都应该是可编译、可运行的**。不要把一个功能拆成「先提交半个不能编译的」+「再补另一半」，那样 bisect 走到中间点就废了。\n\n**实操技巧**:开发时随手提交没关系，推送前用 `git rebase -i` 把提交重排、合并、拆分成逻辑清晰的几个。这也正是「未推送的分支可以放心 rebase」的价值所在。纯格式化 / 改名这类大范围但无逻辑变更的改动，**单独一个提交**,并在 message 里注明「无功能变更」，这样评审的人和后来 blame 的人都能跳过它。',
  followup: ['为什么要求每个提交都能编译通过？', '纯格式化的改动为什么要单独提交？', 'git rebase -i 能做哪些整理？']
},
{
  id: 'tool-005', cat: 'tools', type: 'multi', level: 1, tags: ['Git', '.gitignore'],
  q: '以下哪些内容**不应该**提交进 Git 仓库？（多选）',
  options: [
    '编译产物：.o / .elf / .bin / build 目录',
    '交叉编译工具链的下载压缩包',
    '链接脚本 .ld 和 Makefile / CMakeLists.txt',
    '含真实密钥、服务器地址的配置文件'
  ],
  answer: [0, 1, 3],
  a: '**A、B、D 不该提交，C 必须提交。**\n\n**判断标准很简单：能由源码自动生成的、体积大的、环境相关的、敏感的，都不进仓库。**\n\n- **A 编译产物**:能重新生成，而且每次编译都变，提交进去会让 diff 全是噪声、仓库体积暴涨。`.o .elf .bin .hex .map build/`\n- **B 工具链压缩包**:几百 MB 的二进制，Git 对它没法增量压缩，克隆一次痛苦一次。应该在 README 里写明版本和下载地址，或用包管理/Docker 镜像固定\n- **D 敏感信息**:这是最严重的一条。**提交进去再删掉也没用，历史里永远留着**。应该提交一份 `config.example.ini` 模板，真实配置放在被忽略的 `config.ini` 里\n- **C 构建脚本**:是源码的一部分，**必须提交**,否则别人拿到代码都编不出来\n\n**嵌入式项目常见的 .gitignore**:\n\n```gitignore\nbuild/\n*.o\n*.d\n*.elf\n*.bin\n*.hex\n*.map\n*.lst\n\n# IDE 与工具的本地文件\n.vscode/\n.settings/\n*.uvguix.*\nDebug/\nRelease/\n\n# 本地配置与密钥\nconfig.ini\n*.pem\n*.key\n.env\n```\n\n**关于 IDE 文件的取舍**:Keil / IAR / STM32CubeIDE 的工程文件里既有**该共享的配置**(源文件列表、宏定义、优化等级),也有**纯本地的东西**(窗口布局、断点、最近打开的文件)。实践做法是提交 `.uvprojx` 这类工程文件、忽略 `.uvguix.*` 这类界面文件。\n\n**已经误提交了密钥怎么办**:\n1. **立刻作废那个密钥**——这是第一步，不是最后一步。只要推送过，就必须假定它已泄露\n2. 再用 `git filter-repo`(或 BFG)清理历史，然后所有人重新克隆\n\n顺序不能反。很多人先花半天清理历史，结果密钥早就被爬走了。',
  followup: ['误提交密钥后为什么第一步是作废密钥而不是清理历史？', 'Keil 工程文件哪些该提交？', 'git filter-repo 清理历史后同事该怎么做？']
},
{
  id: 'tool-006', cat: 'tools', type: 'qa', level: 2, tags: ['Git', 'submodule'],
  q: '用 submodule 和 subtree 管理第三方库有什么区别？各自适合什么场景？',
  a: '**submodule:主仓库只记录「某个外部仓库的某个提交」**——存的是一个指针(gitlink),不是代码。\n\n```bash\ngit submodule add https://github.com/x/FreeRTOS.git third_party/FreeRTOS\ngit clone --recurse-submodules <主仓库>     # 克隆时要带这个参数\ngit submodule update --init --recursive     # 忘了带就补这一句\n```\n\n**subtree:把第三方库的代码真正合并进主仓库的目录里**,同时保留上游历史，可以双向同步。\n\n```bash\ngit subtree add --prefix=third_party/lib <url> master --squash\ngit subtree pull --prefix=third_party/lib <url> master --squash\n```\n\n| | submodule | subtree |\n|---|---|---|\n| 代码在主仓库里 | 否，只有指针 | **是** |\n| 主仓库体积 | 小 | 大 |\n| 克隆 | 要额外参数，**新人最容易踩的坑** | 普通 clone 就完整 |\n| 改上游代码 | 天然分离，在子仓库里提交 | 能改但推回上游麻烦 |\n| 上游版本清晰度 | **非常清晰**(就是一个提交哈希) | 被 squash 后不够直观 |\n\n**怎么选**:\n- 库需要**自己维护、频繁改动**(比如公司内部共享的驱动库，多个项目都在用并且会往回提交)→ **submodule**,边界清晰\n- 库只是**拿来用、偶尔升级**(FreeRTOS、mbedTLS、cJSON)→ **subtree** 或者干脆直接拷贝代码进来。省掉了所有协作上的麻烦\n\n**submodule 的三个经典坑(面试常问)**:\n1. **忘记 `--recurse-submodules`**,目录是空的，编译报找不到头文件。CI 脚本里尤其容易漏\n2. **切换分支后 submodule 指针没更新**,编的还是旧版本库，现象是「代码明明改了但行为没变」。配 `git config submodule.recurse true` 可以让 checkout/pull 自动带上\n3. **子仓库处于 detached HEAD**。直接在里面改完提交，提交不属于任何分支，推不上去也容易丢\n\n**实话说**:对大多数嵌入式项目，**直接把第三方库源码拷进仓库(vendoring)并在 README 记录版本和来源，是最省事、最可靠的选择**。构建可重现，新人一次克隆就能编译，代价只是升级时要手动替换。别为了「优雅」而引入协作复杂度。',
  followup: ['submodule 处于 detached HEAD 会带来什么问题？', 'submodule.recurse 配置有什么用？', '为什么说直接拷贝源码往往是更好的选择？']
},
{
  id: 'tool-007', cat: 'tools', type: 'qa', level: 1, tags: ['Git', '冲突'],
  q: '合并冲突是怎么产生的？解决冲突时容易犯什么错？',
  a: '**产生条件：两个分支修改了同一个文件的相邻或相同区域，Git 无法自动判断该保留哪个。**\n\n注意 Git 是**按行**做三方合并(base / ours / theirs)的。改动同一个文件的不同区域通常不冲突;哪怕只是相邻几行，也可能冲突。\n\n```c\n<<<<<<< HEAD\n    baud = 500000;          // 我这边改的\n=======\n    baud = 250000;          // 对方改的\n>>>>>>> feature/can-cfg\n```\n\n**解决冲突时最容易犯的四个错**:\n\n1. **只想着「消掉冲突标记」，不想业务语义**。两边都改了波特率，不是随便选一个，而要搞清楚为什么各自要改——很可能正确答案是第三个值，或者需要改成可配置。**冲突是一个需要沟通的信号，不是一个语法错误**\n\n2. **漏掉冲突标记**。`<<<<<<<` 残留在代码里，C 代码还好(编译报错),但如果残留在**注释里、配置文件里、Python/脚本里**就可能悄悄进主干。解决完一定要全局搜一遍 `<<<<<<<`\n\n3. **解决完不编译不测试就提交**。冲突解决产生的是**从未存在过的代码组合**——两边单独都对，合起来未必对(比如一边改了函数签名、另一边加了新的调用点，Git 不报冲突，但编译就废了)。**合并后必须完整编译+跑测试**\n\n4. **`git checkout --ours/--theirs` 整文件覆盖**。图快直接用一边的整个文件，会把对方在这个文件里的**其他所有改动**一起丢掉，而且不留痕迹。只有在明确知道该文件应整体取某一边时才用\n\n**怎么减少冲突**:\n- **勤同步**。分支活得越久、离主干越远，冲突越难解。`git pull --rebase` 每天拉一次\n- **小提交、小 MR**,单个特性尽快合入\n- **划清模块边界**。老是冲突往往说明代码耦合或职责划分有问题——比如所有人都在改同一个巨型 `config.h`\n- **格式化统一**。团队用同一份 `.clang-format`,避免因为缩进风格产生大面积伪冲突\n\n**实用工具**:`git mergetool` 调三方对比界面;`git config merge.conflictstyle diff3` 会额外显示**共同祖先**的内容，能看出「双方各自改了什么」，比默认的两方对比好判断得多。这个配置面试里提到会加分。',
  followup: ['merge.conflictstyle diff3 多显示了什么？为什么有用？', '为什么解决冲突后必须重新编译测试？', '总在同一个文件冲突说明什么？']
},
{
  id: 'tool-008', cat: 'tools', type: 'qa', level: 2, tags: ['Linux', '命令行'], resume: true,
  q: 'grep / find / awk / sed / xargs 怎么组合使用？举一个实际的排查场景。',
  a: '**各自的定位**:`find` 找文件，`grep` 找内容，`sed` 改文本，`awk` 按列处理和统计，`xargs` 把上一步的输出变成下一步的参数。\n\n**场景一：在陌生的内核/驱动代码里找某个寄存器的用处**\n```bash\ngrep -rn --include="*.c" --include="*.h" "CAN_MCR" drivers/\n# -r 递归 -n 显示行号 --include 限定文件类型(比全量 grep 快很多)\n\ngrep -rn "xxx" . -A 3 -B 3      # 显示上下文\ngrep -rlZ "old_api" . | xargs -0 sed -i "s/old_api/new_api/g"   # 批量改名\n# -Z 和 -0 配对,用 NUL 分隔,能正确处理带空格的路径。这是必须的习惯\n```\n\n**场景二：分析网关的运行日志，统计各类错误的分布**\n```bash\n# 统计每种错误码出现的次数,按次数排序\ngrep "ERROR" gateway.log | awk -F"code=" "{print \\$2}" | awk "{print \\$1}" \\\n  | sort | uniq -c | sort -rn | head -20\n\n# 按小时统计错误频率,看是否和某个时间点相关\nawk "/ERROR/ {print substr(\\$1,1,13)}" gateway.log | uniq -c\n\n# 取出响应时间超过 100ms 的记录并算平均\nawk -F"," "\\$3 > 100 {sum+=\\$3; n++} END {print n, sum/n}" latency.csv\n```\n\n**场景三：清理构建产物、找占空间的大文件**\n```bash\nfind . -name "*.o" -o -name "*.d" | xargs rm -f\nfind . -type f -size +10M -exec ls -lh {} \\;    # 找大文件\nfind . -name "*.c" -newermt "2 days ago"        # 最近两天改过的源文件\nfind . -name "*.c" | xargs wc -l | sort -n | tail   # 哪些文件最长\n```\n\n**几个容易踩的坑(面试提到就加分)**:\n1. **路径带空格**:一定用 `find -print0 | xargs -0`,否则一个带空格的路径会被拆成两个参数\n2. **`xargs` 参数过多**:`xargs` 会自动分批，但如果命令必须一次性接收全部参数就要注意;`-n 1` 可以强制每次一个\n3. **`sed -i` 没有备份**:改错了没法回退。养成 `sed -i.bak` 的习惯，或者先不带 `-i` 看输出确认\n4. **`grep` 的正则方言**:默认是 BRE,`+ ? |` 要转义;用 `grep -E` 切到 ERE,或 `-P` 用 Perl 正则。搞不清就先用 `-E`\n\n**心法**:这套工具的价值在于**目标板上往往没有 IDE、没有 Python、甚至只有 busybox**,能靠管道快速定位问题是嵌入式工程师的基本功。面试时给出一个真实排查过程，比背命令参数有说服力得多。',
  followup: ['为什么处理文件名一定要用 -print0 和 -0？', 'grep 的 BRE 和 ERE 有什么区别？', '目标板上只有 busybox 时哪些命令会缺失？']
},
{
  id: 'tool-009', cat: 'tools', type: 'qa', level: 1, tags: ['Linux', '排查'],
  q: '查看进程、端口占用、内存、磁盘、CPU 分别用什么命令？各自要看哪个关键指标？',
  a: '**进程**\n```bash\ntop / htop              # 实时,按 P 按 CPU 排序、M 按内存排序\nps aux | grep gateway   # 查特定进程\nps -eLf | grep gateway  # 看线程(-L),排查线程泄漏\npstree -p               # 进程父子关系\n```\n\n**端口与网络**\n```bash\nss -tulnp               # 推荐,比 netstat 快。t=TCP u=UDP l=listen n=不解析 p=进程\nss -s                   # 连接状态汇总,看 TIME_WAIT 堆积\nlsof -i :8080           # 谁占了 8080\n```\n> `netstat` 在新系统上已被 `ss` 取代，很多精简 rootfs 里根本没有。答 `ss` 更显得在真机上干过活。\n\n**内存**\n```bash\nfree -h                 # 关键看 available,不是 free\ncat /proc/meminfo\ncat /proc/<pid>/status | grep -E "VmRSS|VmSize"   # 单进程实际占用看 VmRSS\n```\n**最常见的误解**:Linux 会把空闲内存拿去做 page cache,所以 `free` 看起来很小是**正常的**。要看 **available**——它表示「不触发换页就能拿到多少」。有人一看 free 小就报「内存泄漏」，是典型外行判断。\n\n单进程要看 **VmRSS(实际驻留物理内存)**,而不是 VmSize(虚拟地址空间，包含未实际占用的映射，通常大得多)。\n\n**磁盘**\n```bash\ndf -h                   # 各分区使用率\ndf -i                   # inode 使用率——文件数太多时空间没满也会写不进去\ndu -sh * | sort -h       # 当前目录下谁占地方\niostat -x 1             # I/O 是否是瓶颈,看 %util 和 await\n```\n**嵌入式特有的坑**:`df` 显示还有空间但写入失败，九成是 **inode 用尽**(日志切了几十万个小文件),要用 `df -i` 才看得出来。\n\n**CPU**\n```bash\ntop                     # 看 %wa(iowait)和 %si/%hi(软/硬中断)\nvmstat 1                # r 队列长度、cs 上下文切换次数\nmpstat -P ALL 1         # 每个核的负载,看是否只有一个核跑满\ncat /proc/interrupts    # 中断分布,排查中断风暴\n```\n\n**排查心法**:\n- **`%wa` 高** → 瓶颈在 I/O 不在 CPU,去查磁盘/Flash\n- **`%si` 高** → 中断/网络软中断压力大，查 `/proc/interrupts` 有没有中断风暴\n- **单核跑满、其他核空闲** → 单线程瓶颈或中断没做亲和性分配\n- **`cs` 异常高** → 上下文切换过于频繁，可能是锁竞争或线程数过多\n\n还有个万能起手式：**`dmesg -T | tail -50`**。OOM Killer 杀进程、Flash 坏块、USB 掉线、看门狗复位，都在这里留痕。很多人排查半天，其实 dmesg 第一行就写着答案。',
  followup: ['为什么 free 看起来很小是正常的？', 'df 有空间但写不进文件是什么原因？', '%wa 高说明什么？']
},
{
  id: 'tool-010', cat: 'tools', type: 'qa', level: 1, tags: ['ssh', '部署'], resume: true,
  q: 'ssh 免密登录怎么配？往目标板部署时 scp 和 rsync 怎么选？',
  a: '**ssh 免密登录**\n```bash\nssh-keygen -t ed25519                       # 生成密钥对(ed25519 比 rsa 更短更快)\nssh-copy-id root@192.168.1.100              # 公钥追加到目标板的 ~/.ssh/authorized_keys\n\n# 目标板上没有 ssh-copy-id 时手动做:\ncat ~/.ssh/id_ed25519.pub | ssh root@192.168.1.100 \\\n  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"\n```\n**配不上的头号原因是权限**:`~/.ssh` 必须 700、`authorized_keys` 必须 600,权限过宽 sshd 会**直接忽略**而且默认不报错。用 `ssh -v` 看握手过程，或看目标板的 `/var/log/messages`。\n\n**`~/.ssh/config` 是效率关键**:\n```\nHost board\n    HostName 192.168.1.100\n    User root\n    Port 22\n    ServerAliveInterval 30\n```\n之后 `ssh board`、`scp x board:/tmp/` 都能用，脚本里也不用到处写 IP。\n\n**scp vs rsync**\n\n| | scp | rsync |\n|---|---|---|\n| 传输方式 | 全量复制 | **只传差异块** |\n| 断点续传 | 不支持 | `--partial` 支持 |\n| 保留权限时间戳 | 有限 | `-a` 完整保留 |\n| 删除目标多余文件 | 不能 | `--delete` |\n| 目标板是否需要装 | 只要 sshd | **两端都要有 rsync** |\n\n```bash\n# 部署整个 rootfs 或大量文件,反复迭代时快得多\nrsync -avz --delete --exclude="*.o" ./build/ board:/opt/app/\n\n# 只推一个刚编译好的可执行文件\nscp build/gateway board:/opt/app/\n```\n\n**怎么选**:\n- **单个文件、目标板是精简 rootfs(没有 rsync)** → `scp`\n- **反复迭代部署、文件多或体积大、网络慢** → `rsync`。改一行代码只传几 KB 差异，比 scp 每次几十 MB 强太多\n\n**实际开发里的高效做法**:\n```bash\n# 一条命令:编译 → 同步 → 重启服务\nmake -j8 && rsync -az build/gateway board:/opt/app/ && ssh board "systemctl restart gateway"\n```\n把这个写进 Makefile 的 `deploy` 目标，改代码到看现象缩短到几秒。**这种「把调试循环压到最短」的意识，面试时说出来很有说服力**——比会背 rsync 参数重要。\n\n**注意**:`rsync -a` 默认按「大小 + 修改时间」判断是否需要传，交叉编译产物如果时间戳没变但内容变了(少见但存在),可以加 `-c` 强制按校验和比对。',
  followup: ['免密登录配了却不生效，最常见的原因是什么？', 'rsync -a 默认靠什么判断文件需不需要传？', '为什么要把部署流程写进 Makefile？']
},
{
  id: 'tool-011', cat: 'tools', type: 'qa', level: 2, tags: ['Python', '自动化测试'], resume: true,
  q: '用 Python + pyserial / python-can 写自动化测试脚本能做什么？举例说明。',
  a: '**核心价值：把手工点几十遍的回归测试变成一条命令，并且结果可复现、可留档。**\n\n**场景一：UDS 诊断服务的自动化回归**\n```python\nimport can, isotp, time\n\nbus = can.interface.Bus(bustype="vector", channel=0, bitrate=500000)\n\ndef uds_request(req, timeout=1.0):\n    bus.send(can.Message(arbitration_id=0x7E0, data=req, is_extended_id=False))\n    end = time.time() + timeout\n    while time.time() < end:\n        msg = bus.recv(timeout=0.1)\n        if msg and msg.arbitration_id == 0x7E8:\n            return list(msg.data)\n    return None\n\n# 遍历所有支持的 DID,核对返回是否符合诊断规范\nfor did in DID_LIST:\n    rsp = uds_request([0x03, 0x22, did >> 8, did & 0xFF])\n    assert rsp and rsp[1] == 0x62, f"DID {did:#06x} 读取失败: {rsp}"\n```\n\n这类脚本能覆盖：**会话切换、安全访问、所有 DID 的读写、否定响应码是否符合规范(比如未解锁时该返回 0x33)、超时行为、P2/P2* 时间是否达标**。手工用诊断工具点一遍要半天，脚本几分钟跑完，而且**每次固件改动都能重跑**。\n\n**场景二：Bootloader 刷写的压力测试**\n\n刷写流程涉及擦除、分块传输、校验、跳转，是最容易出偶发问题的地方。脚本可以**连续刷 500 次**,每次随机在中途断电/断线，验证：\n- 断在任意阶段后设备能否恢复到可再次刷写的状态\n- 版本号和校验和是否始终一致\n- 有没有极低概率的 Flash 写失败\n\n**这种「几百次循环 + 随机故障注入」是纯手工绝对做不到的**,而偶发问题往往只有这样才能暴露。\n\n**场景三：串口设备的协议一致性测试**\n```python\nimport serial\nser = serial.Serial("COM3", 115200, timeout=1)\n\n# 构造异常输入,验证解析器的健壮性\nfor bad in [b"\\xAA\\xBB", b"", b"\\x00"*1024, random_bytes(64)]:\n    ser.write(bad)\n    assert device_still_alive(ser), f"畸形输入导致设备异常: {bad!r}"\n```\n**故障注入是重点**:超长帧、截断帧、错误校验和、错误长度字段、连续压测。协议解析器的 bug 大多藏在这些边界上。\n\n**工程化建议**:\n1. 用 **pytest** 组织测试，天然有断言、参数化、失败报告\n2. **结果输出成 CSV/JUnit XML**,能接进 CI 并生成趋势图\n3. **把失败时的原始报文全存下来**,否则偶发失败复现不了就白跑了\n4. 硬件相关的收发抽象成一层，**换 CAN 卡(Vector / ZLG / PEAK)只改配置不改测试用例**\n\n**面试怎么说**:重点讲「这个脚本让我发现了什么手工测不出来的问题」——比如「连续刷写 200 次时出现一次 Flash 写超时，定位到是擦除后没等 BUSY 位清零」。这比列举用过哪些库有力得多。',
  followup: ['为什么强调保存失败时的原始报文？', '故障注入应该覆盖哪些异常输入？', '怎么让测试用例不依赖具体的 CAN 硬件？']
},
{
  id: 'tool-012', cat: 'tools', type: 'qa', level: 2, tags: ['Python', '日志分析'],
  q: '用 Python 分析设备日志的典型流程是什么？',
  a: '**四步：解析 → 结构化 → 统计/关联 → 可视化。**\n\n**1. 解析**——用正则把非结构化的文本变成字段\n```python\nimport re, pandas as pd\n\nPAT = re.compile(\n    r"(?P<ts>\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d\\.\\d+)\\s+"\n    r"\\[(?P<level>\\w+)\\]\\s+(?P<mod>\\w+):\\s+(?P<msg>.*)"\n)\n\nrows = []\nwith open("device.log", encoding="utf-8", errors="replace") as f:\n    for line in f:\n        m = PAT.match(line)\n        if m:\n            rows.append(m.groupdict())\ndf = pd.DataFrame(rows)\ndf["ts"] = pd.to_datetime(df["ts"])\n```\n> `errors="replace"` 很重要：设备日志经常因为掉电、缓冲区截断而出现乱码字节，不处理会直接抛异常中断分析。\n\n**2. 结构化后就能用 pandas 做各种切片**\n```python\ndf[df.level == "ERROR"].mod.value_counts()          # 哪个模块报错最多\ndf.set_index("ts").resample("1min").size()          # 每分钟日志量,找异常时段\n```\n\n**3. 关联分析——这一步才是价值所在**\n```python\n# 提取重连事件的时间点,看间隔分布\nrec = df[df.msg.str.contains("reconnect")].ts\nprint(rec.diff().describe())\n\n# 复位前 5 秒发生了什么(排查看门狗复位的经典手法)\nfor t in df[df.msg.str.contains("system reset")].ts:\n    print(df[(df.ts > t - pd.Timedelta("5s")) & (df.ts <= t)][["ts","mod","msg"]])\n```\n**「异常发生前的窗口里有什么」是排查偶发问题最有效的角度**。人眼在几十万行里翻是不可能的，脚本几秒就切出来了。\n\n**4. 可视化**\n```python\nimport matplotlib.pyplot as plt\ndf.set_index("ts").resample("1min").size().plot()\nplt.savefig("log_rate.png", dpi=120)\n```\n把错误频率、内存占用、响应延迟画成时间序列，**趋势和相关性一眼就能看出来**——比如「内存占用每小时涨 2MB」这种缓慢泄漏，看数字看不出，画出来是一条直线。\n\n**实战经验**:\n- **让固件配合分析**。日志格式统一、带精确时间戳、关键量以 `key=value` 输出，后期解析就是几行正则。**日志格式是设计出来的，不是事后凑的**\n- **大文件别一次读进内存**。几百 MB 的日志用逐行生成器处理，或者先 `grep` 粗筛再解析\n- **正则要能容错**。设备日志一定会有截断行、乱码行，匹配不上的**统计出来但不要崩**——匹配率突然下降本身就是个信号\n- 一次性分析用 Jupyter 交互探索，固定下来的分析写成脚本进 CI,**每次版本发布自动出一份日志健康报告**',
  followup: ['为什么要看异常发生前的时间窗口？', '固件的日志格式该怎么设计才便于后期分析？', '几百 MB 的日志怎么处理才不爆内存？']
},
{
  id: 'tool-013', cat: 'tools', type: 'qa', level: 2, tags: ['CMake', '交叉编译'], resume: true,
  q: 'CMake 的 toolchain 文件怎么写？多平台配置该怎么组织？',
  a: '**toolchain 文件的作用：告诉 CMake「目标平台不是本机」**,必须在第一次配置时通过 `-DCMAKE_TOOLCHAIN_FILE` 传入(后面再改不生效，得删掉 build 目录重来)。\n\n```cmake\n# cmake/arm-none-eabi.cmake\nset(CMAKE_SYSTEM_NAME Generic)          # 裸机填 Generic,Linux 目标填 Linux\nset(CMAKE_SYSTEM_PROCESSOR arm)\n\nset(TOOLCHAIN_PREFIX arm-none-eabi-)\nset(CMAKE_C_COMPILER   ${TOOLCHAIN_PREFIX}gcc)\nset(CMAKE_CXX_COMPILER ${TOOLCHAIN_PREFIX}g++)\nset(CMAKE_OBJCOPY      ${TOOLCHAIN_PREFIX}objcopy)\nset(CMAKE_SIZE         ${TOOLCHAIN_PREFIX}size)\n\n# 关键:裸机没有 crt0 和标准库,链接测试程序必然失败\n# 不设这一句,CMake 的编译器检测就过不去\nset(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)\n\nset(ARCH_FLAGS "-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard")\nset(CMAKE_C_FLAGS_INIT "${ARCH_FLAGS} -ffunction-sections -fdata-sections")\nset(CMAKE_EXE_LINKER_FLAGS_INIT "${ARCH_FLAGS} -Wl,--gc-sections -Wl,-Map=out.map")\n\n# 只在 sysroot 里找库,不要误用主机的\nset(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM BEFORE)\nset(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)\nset(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)\n```\n\n**`CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY` 是裸机交叉编译最经典的坑**——不加这句，CMake 会尝试链接一个完整可执行文件来验证编译器，而裸机缺启动文件和 libc,直接报「编译器无法工作」。面试提到这一点说明真配过。\n\n**option 开关**\n```cmake\noption(ENABLE_LOG      "启用日志输出"   ON)\noption(ENABLE_SECURITY "启用签名验签"   ON)\nset(BOARD "v2" CACHE STRING "硬件版本")\nset_property(CACHE BOARD PROPERTY STRINGS "v1;v2;v3")\n\ntarget_compile_definitions(app PRIVATE\n    $<$<BOOL:${ENABLE_LOG}>:CFG_LOG_ENABLE>\n    BOARD_VERSION=${BOARD}\n)\n```\n**优于满屏 `#ifdef` 的地方**:开关集中在一处、`cmake -L` 能列出所有选项、CI 里能批量组合验证。\n\n**多平台的目录组织**\n```\ncmake/\n  arm-none-eabi.cmake      # STM32 裸机\n  aarch64-linux-gnu.cmake  # i.MX Linux\nboards/\n  v1/board_config.h\n  v2/board_config.h\nsrc/\n  hal/          # 平台相关,按目标选择性编译\n  app/          # 平台无关,任何平台都能编\ntest/           # 主机编译,跑单元测试\n```\n**核心原则：把平台差异收拢在 HAL 一层，应用层代码不带任何 `#ifdef PLATFORM`。** 好处不只是移植方便——**应用层能在 PC 上直接编译并跑单元测试**,不用等硬件、不用烧板子，开发效率完全不同。\n\n```bash\ncmake -B build/stm32 -DCMAKE_TOOLCHAIN_FILE=cmake/arm-none-eabi.cmake -DBOARD=v2\ncmake -B build/host  -DBUILD_TESTING=ON      # 同一份 app 代码,主机上跑测试\ncmake --build build/stm32 -j8\n```\n\n每个目标一个独立的 build 目录，互不干扰，也不用反复重新配置。',
  followup: ['为什么裸机交叉编译要设 CMAKE_TRY_COMPILE_TARGET_TYPE？', '为什么应用层代码里不该出现 #ifdef PLATFORM？', 'toolchain 文件改了不生效是什么原因？']
},
{
  id: 'tool-014', cat: 'tools', type: 'qa', level: 2, tags: ['CI', '静态检查'],
  q: '嵌入式项目的 CI 能做什么？没有硬件的情况下怎么做有意义的自动化验证？',
  a: '**很多人以为嵌入式没法做 CI(因为要烧板子),其实绝大部分价值不依赖硬件。**\n\n**一、编译验证(最基础也最有用)**\n- **所有配置组合都要编过**。`ENABLE_LOG=OFF` 那份代码半年没人编过，一开就是几十个错误——这是极常见的现象\n- **开 `-Wall -Wextra -Werror`**。警告当错误处理，才不会越积越多\n- 多个硬件版本、Debug/Release 全部并行编译\n\n**二、静态检查**\n```bash\ncppcheck --enable=all --error-exitcode=1 src/\nclang-tidy src/*.c -- -Iinclude\nclang-format --dry-run --Werror src/*.c    # 格式不合规直接失败\n```\n静态分析对嵌入式的价值特别高：**空指针解引用、数组越界、未初始化变量、内存泄漏**这些在 PC 上会崩在你面前，在 MCU 上只是「偶尔跑飞」。能在提交时就拦住是巨大的收益。有 MISRA-C 要求的项目还能接商业工具。\n\n**三、单元测试(关键在于代码可测)**\n\n只要架构上把硬件访问抽象掉，**协议解析、状态机、算法、环形缓冲、CRC 这些纯逻辑都能在主机上跑**:\n```bash\ncmake -B build/host -DBUILD_TESTING=ON && ctest --test-dir build/host --output-on-failure\n```\n配合 Unity / CMock / GoogleTest,再跑 **gcov 出覆盖率**。**能不能做单元测试其实是架构问题，不是工具问题**——如果解析函数里直接读了寄存器，那就永远测不了。\n\n主机上跑还有个额外好处：**可以开 ASan/UBSan/Valgrind**,内存越界和未定义行为会当场暴露，而这些在目标板上根本查不出来。\n\n**四、固件体积监控**\n```bash\narm-none-eabi-size -B build/app.elf\n# 和基线比对,Flash/RAM 增长超过阈值就告警\n```\n**这一条被严重低估**。Flash 快满的项目里，某次提交悄悄多了 8KB,等到发现已经很难回退了。CI 里画一条体积趋势曲线，每次 MR 显示「Flash +312B / RAM +0B」，非常实用。\n\n**五、硬件在环(HIL,进阶)**\n\n实验室放几块目标板接上 CAN 卡/继电器，CI 自动烧录 + 跑 [[tool-011]] 那类 Python 测试。成本高但对量产项目值得，尤其能覆盖刷写、通信、低功耗唤醒这些纯软件测不到的部分。\n\n**落地建议(按投入产出排序)**:\n1. 先做**多配置编译 + `-Werror`** —— 半天就能搭起来，立刻拦住最多问题\n2. 再加**静态检查**和**体积监控** —— 配置成本低，收益持续\n3. 然后**逐步补单元测试**,新代码要求覆盖，老代码改到哪补到哪\n4. 最后再考虑 HIL\n\n**别一上来就追求完美**。一个只做「编译 + cppcheck」的 CI 也远胜于没有 CI。',
  followup: ['为什么说能否做单元测试是架构问题？', '固件体积监控为什么重要？', '主机上跑测试能用哪些 sanitizer？']
},
{
  id: 'tool-015', cat: 'tools', type: 'qa', level: 2, tags: ['代码评审', '协作'],
  q: '代码评审应该重点看什么？怎么给出有建设性的评审意见？',
  a: '**优先级从高到低(时间有限就按这个顺序看)**:\n\n**1. 正确性与边界** —— 唯一不能妥协的\n- 边界条件：空指针、数组越界、除零、索引 off-by-one\n- 返回值有没有检查(`malloc`、`read`、HAL 函数)\n- 整数溢出、隐式类型转换、有符号无符号混用\n- **嵌入式特有**:中断和主循环共享的变量有没有 `volatile` 和临界区保护;中断里有没有调用阻塞函数或 `malloc`;栈上有没有开大数组\n\n**2. 并发与资源**\n- 加锁范围是否正确，有没有死锁可能\n- 资源有没有在所有出口路径上释放(尤其是**提前 return 的错误分支**——这是内存泄漏的头号来源)\n- 有没有在中断上下文里睡眠\n\n**3. 设计与可维护性**\n- 职责是否单一，有没有把三件事塞进一个函数\n- 有没有重复代码(同样的解析逻辑复制了三份，以后改一处漏两处)\n- 命名是否表达意图，魔法数字有没有定义成常量\n\n**4. 测试**\n- 新逻辑有没有对应测试，边界情况覆盖了吗\n- 改了 bug 有没有加一个能复现该 bug 的测试(**防回归**)\n\n**5. 风格** —— 最不重要，而且应该交给工具\n\n**怎么给意见才有建设性**:\n\n| 不好 | 好 |\n|---|---|\n| 「这里写得不对」 | 「这里 `len` 为 0 时会执行 `buf[len-1]`,下标是 -1。建议先判空返回」 |\n| 「这样写不好」 | 「这个函数里 malloc 之后有三个 return 分支没有 free,建议用统一的错误出口(goto cleanup)」 |\n| 「缩进不对」 | 交给 clang-format,别人工挑 |\n\n**四条原则**:\n1. **说清「为什么」和「怎么改」**。只说有问题不给方向，对方只能猜\n2. **区分阻塞项和建议**。用 `[必须]` / `[建议]` / `[疑问]` 标注。把「变量名可以更好」和「这里会越界」用同样语气提出来，评审就失去了重点\n3. **评论代码不评论人**。说「这个函数」而不是「你写的这个」\n4. **有疑问先问不先判**。「这里为什么用了 memcpy 而不是直接赋值?是有对齐考虑吗」——很多时候作者有你不知道的理由\n\n**作为被评审方**:主动写清 MR 的背景和测试方式，把 MR 控制在能被认真看完的大小(**300 行以内**)。3000 行的 MR 只会得到「LGTM」，那等于没评审。\n\n**风格问题一律交给工具**:`.clang-format` + CI 检查。人的注意力应该花在逻辑上，而不是花括号位置。**评审里出现风格争论，说明工具链缺配置。**',
  followup: ['为什么错误分支是内存泄漏的高发处？', '为什么要区分「必须」和「建议」？', '嵌入式代码评审有哪些特有的检查点？']
},
{
  id: 'tool-016', cat: 'tools', type: 'single', level: 1, tags: ['注释', '文档'],
  q: '以下哪条注释是有价值的？',
  options: [
    'i++;  // i 自增 1',
    'delay_ms(2);  // 等待 EEPROM 内部写周期完成，数据手册要求 ≥1.5ms',
    'if (x > 0) {  // 如果 x 大于 0',
    '// 以下是初始化代码'
  ],
  answer: [1],
  a: '**B。它解释了「为什么是这个值」，而这是代码本身无法表达的。**\n\n如果没有这条注释，后来的人看到 `delay_ms(2)` 只会想「2ms 是拍脑袋定的吧，优化一下改成 0」——然后偶发的 EEPROM 写失败就出现了，还极难定位。**这条注释挡住了一个未来的 bug。**\n\n**A、C 是纯粹的噪声**:把代码翻译成中文，读者从代码本身就能看懂。这类注释不只是没用，而是**有害**——它增加了需要维护的内容，而且一旦代码改了注释没改，就变成误导。\n\n**D 是可以删掉的**:如果一段代码需要「以下是初始化代码」来说明，应该做的是**把它抽成一个叫 `init_xxx()` 的函数**。用函数名代替注释，编译器会帮你保证名字和代码在一起。\n\n**核心原则：注释写 why,代码表达 what。**\n\n**真正值得写注释的地方**:\n\n1. **反直觉的做法和它的原因**\n```c\n/* 必须先读 SR 再读 DR 才能清除 OVR 标志,顺序颠倒会导致中断反复触发。\n   参考 RM0090 第 30.6.1 节。 */\n(void)USARTx->SR;\ndata = USARTx->DR;\n```\n\n2. **数据手册/协议规范的依据**:寄存器时序、超时值、魔法数字的来源。**给出章节号，让后人能查证**\n\n3. **硬件缺陷和临时方案**\n```c\n/* 芯片 Errata 2.1.3:DMA 与 Flash 擦除并发时可能丢数据。\n   暂时在擦除前关闭 DMA,芯片 revB 修复后可移除。 */\n```\n\n4. **对外接口的契约**:参数范围、返回值语义、是否可重入、**能否在中断里调用**、调用前需要什么前置条件。这些是调用者必须知道但从签名看不出来的\n\n5. **有意为之的「怪」代码**:防止后人「好心」改回去\n```c\n/* 这里故意不用 memcpy:该地址只支持 32 位对齐访问,\n   memcpy 的字节拷贝会触发总线错误 */\n```\n\n**没价值的注释类型汇总**:复述代码、过时的注释(**比没注释更糟**)、大段被注释掉的死代码(交给 Git,直接删)、`// TODO` 放了三年没人管、自动生成的空模板(`@param x 参数 x`)。\n\n**一句话判断标准：如果注释删掉后，读者会不知道「为什么这么写」，那它就有价值;如果只是不知道「这行在做什么」，那应该改进的是代码而不是加注释。**',
  followup: ['为什么过时的注释比没有注释更糟？', '对外接口的注释应该写清哪些契约？', '大段注释掉的代码该怎么处理？']
},
{
  id: 'tool-017', cat: 'tools', type: 'qa', level: 3, tags: ['Linux', 'eBPF', '性能调试', '内核'], resume: true,
  q: '什么是 Linux eBPF (Extended Berkeley Packet Filter)？它在 Linux 性能分析与内核诊断中有何独特优势？',
  a: '**1. eBPF 原理**：\n' +
     'eBPF 是 Linux 内核中的一个**安全沙箱虚拟机**。它允许开发者编写自定义 C 代码（编译为 eBPF 字节码），在**不修改内核源码、不需要重新编译或加载第三方内核模块**的情况下，动态注入到内核的任意探针位置运行。\n\n' +
     '**2. 核心机制（Verifier + JIT + Maps + Probes）**：\n' +
     '- **Verifier（校验器）**：在字节码加载到内核前做严格安全检查（如禁止死循环、越界访问），保证 eBPF 代码绝不会导致 Linux 内核崩溃或死锁。\n' +
     '- **JIT 编译器**：将字节码转换为本地 CPU 原生机器码，近乎零性能开销。\n' +
     '- **eBPF Maps**：高效的数据结构（如 Hash, Array, RingBuffer），用于在内核态与用户态程序之间传递追踪数据。\n' +
     '- **Probe 挂载点**：\n' +
     '  * kprobe / kretprobe：动态挂载任意内核函数入口/返回\n' +
     '  * uprobe / uretprobe：动态挂载用户态进程（如 C++ 可执行文件）的函数\n' +
     '  * tracepoint：内核预埋的静态跟踪点\n' +
     '  * XDP (eXpress Data Path)：在网卡驱动层直接拦截与处理数据包\n\n' +
     '**3. 相对传统诊断工具的优势**：\n' +
     '- **极低开销**：无需频繁在用户态和内核态切换，计算和聚合直接在内核完成。比传统的 printk、ftrace 或 strace 开销小几个数量级。\n' +
     '- **绝对安全**：传统 .ko 驱动挂了会导致 Panic/蓝屏，eBPF 被 Verifier 拦截，安全性有严格保证。\n' +
     '- **生产环境可直接使用**：常用的现成前端工具有 **bpftrace** 和 **BCC**，几行命令就能统计系统文件 I/O 延迟分布、TCP 握手延时、内核锁竞争等硬核问题。',
  followup: ['kprobe 和 tracepoint 有什么区别？', 'eBPF Maps 怎么把内核态数据传给用户态？']
}
]);
