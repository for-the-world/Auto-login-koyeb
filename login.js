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
    
    // 优化页面加载策略，类似Python脚本
    try {
      // 首先尝试简单的页面导航，不等待networkidle
      await page.goto('https://app.koyeb.com/auth/signin', { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      console.log(`✅ ${user} - 页面基本加载完成`);
    } catch (e) {
      console.log(`⚠️ ${user} - domcontentloaded加载失败，尝试load事件: ${e.message}`);
      try {
        // 备选方案：等待load事件
        await page.goto('https://app.koyeb.com/auth/signin', { 
          waitUntil: 'load',
          timeout: 25000 
        });
        console.log(`✅ ${user} - 页面load事件完成`);
      } catch (e2) {
        console.log(`⚠️ ${user} - load事件也失败，尝试无等待策略: ${e2.message}`);
        try {
          // 最后备选：不等待任何特定事件
          await page.goto('https://app.koyeb.com/auth/signin', { 
            waitUntil: 'commit',
            timeout: 15000 
          });
          console.log(`✅ ${user} - 页面导航完成（commit）`);
        } catch (e3) {
          throw new Error(`页面访问完全失败: ${e3.message}`);
        }
      }
    }
    
    // 类似Python脚本，简单等待页面稳定
    console.log(`⏳ ${user} - 等待页面稳定...`);
    await page.waitForTimeout(5000);
    
    // 验证页面是否正确加载
    const currentUrl = page.url();
    console.log(`🔍 ${user} - 当前URL: ${currentUrl}`);
    console.log(`🔍 ${user} - 页面标题: ${await page.title()}`);
    
    if (!currentUrl.includes('koyeb.com')) {
      throw new Error('页面未正确加载到Koyeb域名');
    }
    
    // 第一步：输入邮箱
    console.log(`📧 ${user} - 填写邮箱...`);
    
    // 使用多种定位器策略，类似Python脚本
    let emailInput = null;
    const emailLocators = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="Email"]',
      'css=input[name="email"]',
      'css=input[type="email"]',
      'xpath=//input[@type="email"]',
      'xpath=//input[@name="email"]'
    ];
    
    for (const locator of emailLocators) {
      try {
        emailInput = await page.locator(locator).first();
        if (await emailInput.count() > 0) {
          console.log(`✅ ${user} - 使用定位器 '${locator}' 找到邮箱输入框`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (emailInput && await emailInput.count() > 0) {
      await emailInput.fill(user);
      await page.waitForTimeout(2000);
      console.log(`✅ ${user} - 邮箱输入成功`);
    } else {
      throw new Error('未找到邮箱输入框');
    }
    
    // 点击Continue按钮
    console.log(`➡️ ${user} - 点击Continue按钮...`);
    
    // 优先使用JavaScript点击，类似Python脚本
    let continueClicked = false;
    try {
      await page.evaluate(() => {
        const continueBtn = document.querySelector("button[type='submit']");
        if (continueBtn && continueBtn.textContent.includes('Continue')) {
          continueBtn.click();
        }
      });
      continueClicked = true;
      console.log(`✅ ${user} - 使用JavaScript成功点击Continue按钮`);
    } catch (e) {
      console.log(`⚠️ ${user} - JavaScript点击失败，尝试Playwright点击: ${e.message}`);
      try {
        await page.click('button:has-text("Continue")', { timeout: 10000 });
        continueClicked = true;
        console.log(`✅ ${user} - 使用Playwright成功点击Continue按钮`);
      } catch (e2) {
        throw new Error(`无法点击Continue按钮: ${e2.message}`);
      }
    }
    
    if (!continueClicked) {
      throw new Error('无法点击Continue按钮');
    }
    
    await page.waitForTimeout(3000);
    
    // 第二步：输入密码
    console.log(`🔒 ${user} - 填写密码...`);
    
    // 使用多种定位器策略查找密码输入框
    let passwordInput = null;
    const passwordLocators = [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="Password"]',
      'css=input[name="password"]',
      'css=input[type="password"]',
      'xpath=//input[@type="password"]',
      'xpath=//input[@name="password"]'
    ];
    
    // 等待密码输入框出现
    let passwordFound = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      for (const locator of passwordLocators) {
        try {
          passwordInput = await page.locator(locator).first();
          if (await passwordInput.count() > 0) {
            console.log(`✅ ${user} - 使用定位器 '${locator}' 找到密码输入框`);
            passwordFound = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (passwordFound) break;
      
      console.log(`⏳ ${user} - 等待密码输入框出现... (${attempt + 1}/10)`);
      await page.waitForTimeout(1000);
    }
    
    if (!passwordFound) {
      throw new Error('未找到密码输入框');
    }
    
    await passwordInput.fill(pass);
    await page.waitForTimeout(2000);
    console.log(`✅ ${user} - 密码输入成功`);
    
    // 点击Sign in按钮
    console.log(`🔑 ${user} - 点击Sign in按钮...`);
    
    // 首先找到Sign in按钮，类似Python脚本逻辑
    let signInButton = null;
    try {
      signInButton = await page.locator('text=Sign in').first();
      if (await signInButton.count() === 0) {
        throw new Error('未找到Sign in按钮');
      }
      console.log(`✅ ${user} - 找到Sign in按钮，检查是否可用...`);
    } catch (e) {
      throw new Error(`未找到Sign in按钮: ${e.message}`);
    }
    
    // 等待Sign in按钮变为可用状态，完全按照Python脚本逻辑
    let signInClicked = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        // 重新获取按钮元素和class属性
        const currentButton = await page.locator('text=Sign in').first();
        const buttonClass = await currentButton.getAttribute('class');
        console.log(`🔍 ${user} - Sign in按钮class属性: ${buttonClass}`);
        
        // 检查按钮是否可用，完全按照Python脚本的逻辑
        let isDisabled = false;
        if (buttonClass) {
          isDisabled = buttonClass.includes('disabled') || buttonClass.includes('bg-gray/70');
        }
        
        if (!isDisabled) {
          console.log(`✅ ${user} - Sign in按钮已可用，开始点击...`);
          
          // 尝试多种点击方法，完全按照Python脚本的顺序
          try {
            // 方法1: 使用JavaScript点击（最可靠）
            await page.evaluate(() => {
              const submitBtn = document.querySelector("button[type='submit']");
              if (submitBtn) submitBtn.click();
            });
            signInClicked = true;
            console.log(`✅ ${user} - 使用JavaScript成功点击Sign in按钮`);
            break;
          } catch (e1) {
            console.log(`⚠️ ${user} - JavaScript点击失败: ${e1.message}`);
            try {
              // 方法2: 使用Playwright的click方法
              await currentButton.click();
              signInClicked = true;
              console.log(`✅ ${user} - 使用Playwright成功点击Sign in按钮`);
              break;
            } catch (e2) {
              console.log(`⚠️ ${user} - Playwright点击失败: ${e2.message}`);
              try {
                // 方法3: 使用hover + click
                await currentButton.hover();
                await page.waitForTimeout(500);
                await currentButton.click();
                signInClicked = true;
                console.log(`✅ ${user} - 使用hover+click成功点击Sign in按钮`);
                break;
              } catch (e3) {
                console.log(`❌ ${user} - 所有点击方法都失败: ${e3.message}`);
                break;
              }
            }
          }
        } else {
          console.log(`⏳ ${user} - 按钮仍被禁用，等待中... (${attempt + 1}/10)`);
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        console.log(`⚠️ ${user} - 检查按钮状态时出错: ${e.message}，重试中... (${attempt + 1}/10)`);
        await page.waitForTimeout(1000);
      }
    }
    
    if (!signInClicked) {
      throw new Error('无法点击Sign in按钮');
    }
    
    // 等待页面响应登录操作，减少超时时间
    console.log(`⏳ ${user} - 等待页面响应登录操作...`);
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (e) {
      console.log(`⚠️ ${user} - 网络空闲等待超时，继续检查登录状态...`);
    }
    await page.waitForTimeout(3000);
    
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
      if (pageContent.includes('dashboard') || 
          pageContent.includes('applications') || 
          pageContent.includes('services') ||
          pageContent.includes('Deployments') ||
          pageContent.includes('Overview')) {
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
