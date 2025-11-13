const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `🎉 Koyeb 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
    
    console.log(`📱 ${user} - 正在访问Koyeb登录页面...`);
    await page.goto('https://app.koyeb.com/auth/signin', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    // 第一步：输入邮箱
    console.log(`📧 ${user} - 填写邮箱...`);
    
    // 尝试多种方式定位邮箱输入框
    let emailInput = await page.locator('input[name="email"]').first();
    if (await emailInput.count() === 0) {
      emailInput = await page.locator('input[type="email"]').first();
    }
    if (await emailInput.count() === 0) {
      emailInput = await page.locator('input[placeholder*="Email"]').first();
    }
    
    if (await emailInput.count() > 0) {
      await emailInput.fill(user);
      await page.waitForTimeout(2000);
      console.log(`✅ ${user} - 邮箱输入成功`);
    } else {
      throw new Error('未找到邮箱输入框');
    }
    
    // 点击Continue按钮
    console.log(`➡️ ${user} - 点击Continue按钮...`);
    await page.click('button:has-text("Continue")', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // 第二步：输入密码
    console.log(`🔒 ${user} - 填写密码...`);
    
    // 等待密码输入框出现并定位
    let passwordInput = await page.locator('input[name="password"]').first();
    if (await passwordInput.count() === 0) {
      passwordInput = await page.locator('input[type="password"]').first();
    }
    if (await passwordInput.count() === 0) {
      passwordInput = await page.locator('input[placeholder*="Password"]').first();
    }
    
    // 等待密码输入框出现（最多等待10秒）
    let attempts = 0;
    while (await passwordInput.count() === 0 && attempts < 10) {
      await page.waitForTimeout(1000);
      passwordInput = await page.locator('input[name="password"]').first();
      if (await passwordInput.count() === 0) {
        passwordInput = await page.locator('input[type="password"]').first();
      }
      if (await passwordInput.count() === 0) {
        passwordInput = await page.locator('input[placeholder*="Password"]').first();
      }
      attempts++;
    }
    
    if (await passwordInput.count() > 0) {
      await passwordInput.fill(pass);
      await page.waitForTimeout(2000);
      console.log(`✅ ${user} - 密码输入成功`);
    } else {
      throw new Error('未找到密码输入框');
    }
    
    // 点击Sign in按钮
    console.log(`🔑 ${user} - 点击Sign in按钮...`);
    
    // 等待Sign in按钮变为可用状态
    let signInAttempts = 0;
    let signInClicked = false;
    
    while (!signInClicked && signInAttempts < 10) {
      try {
        const signInButton = await page.locator('button:has-text("Sign in")').first();
        if (await signInButton.count() > 0) {
          // 检查按钮是否被禁用
          const isDisabled = await signInButton.isDisabled();
          
          if (!isDisabled) {
            // 尝试多种点击方法
            try {
              await signInButton.click();
              signInClicked = true;
              console.log(`✅ ${user} - Sign in按钮点击成功`);
            } catch (clickError) {
              // 尝试JavaScript点击
              await page.evaluate(() => {
                const submitBtn = document.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
              });
              signInClicked = true;
              console.log(`✅ ${user} - 使用JavaScript成功点击Sign in按钮`);
            }
          } else {
            console.log(`⏳ ${user} - Sign in按钮仍被禁用，等待中... (${signInAttempts + 1}/10)`);
            await page.waitForTimeout(1000);
          }
        } else {
          console.log(`⏳ ${user} - 等待Sign in按钮出现... (${signInAttempts + 1}/10)`);
          await page.waitForTimeout(1000);
        }
        signInAttempts++;
      } catch (e) {
        console.log(`⚠️ ${user} - 检查Sign in按钮时出错: ${e.message}`);
        await page.waitForTimeout(1000);
        signInAttempts++;
      }
    }
    
    if (!signInClicked) {
      throw new Error('无法点击Sign in按钮');
    }
    
    // 等待页面响应登录操作
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // 检查登录是否成功
    const currentUrl = page.url();
    console.log(`🔍 ${user} - 登录后URL: ${currentUrl}`);
    
    if (currentUrl.includes('koyeb.com') && !currentUrl.includes('/auth/signin')) {
      console.log(`✅ ${user} - 登录成功！已跳转到主页面`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      // 检查页面内容以确定登录状态
      const pageContent = await page.content();
      if (pageContent.includes('dashboard') || pageContent.includes('applications') || pageContent.includes('services')) {
        console.log(`✅ ${user} - 登录成功！（通过页面内容确认）`);
        result.success = true;
        result.message = `✅ ${user} 登录成功`;
      } else {
        console.log(`❌ ${user} - 登录失败，仍在登录页面`);
        result.message = `❌ ${user} 登录失败`;
      }
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，等待一下再处理下一个
    if (i < accountList.length - 1) {
      console.log('⏳ 等待3秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 Koyeb登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  await sendTelegram(summaryMessage);
  
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(console.error);
