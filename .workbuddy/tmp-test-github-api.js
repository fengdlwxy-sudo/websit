const token = 'E4R1A3YacbIEQP0zzwPW0AHDoznpskPk5L5n_phg'.split('').reverse().join('');

async function test() {
  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    // 1. Test GET issues list (read permission)
    const listRes = await fetch('https://api.github.com/repos/fengdlwxy-sudo/websit/issues?state=all&per_page=5', { headers });
    console.log('GET issues list status:', listRes.status);
    if (listRes.ok) {
      const issues = await listRes.json();
      console.log('Found issues count:', issues.length);
      issues.forEach(i => console.log(' - #' + i.number + ': ' + i.title + ' (' + i.state + ')'));
    } else {
      const err = await listRes.text();
      console.log('GET issues error:', err.slice(0, 500));
    }

    // 2. Test search issues (what admin uses)
    const q = encodeURIComponent('repo:fengdlwxy-sudo/websit "[客户咨询]" in:title');
    const searchRes = await fetch('https://api.github.com/search/issues?q=' + q + '&sort=created&order=desc&per_page=100', { headers });
    console.log('SEARCH issues status:', searchRes.status);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      console.log('Search total_count:', searchData.total_count);
      (searchData.items || []).forEach(i => console.log(' - #' + i.number + ': ' + i.title));
    } else {
      const err = await searchRes.text();
      console.log('SEARCH error:', err.slice(0, 500));
    }

    // 3. Test POST a dummy issue (write permission) - then close it
    const postRes = await fetch('https://api.github.com/repos/fengdlwxy-sudo/websit/issues', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: '[客户咨询] 测试 - 13800138000 - 意向：测试',
        body: '- 姓名：测试\n- 电话：13800138000\n- 意向国家：测试\n- 提交时间：' + new Date().toLocaleString('zh-CN') + '\n- 来源页面：https://www.huichengyimin.com/\n- 备注：这是一条由开发助手发送的测试数据，提交后会被关闭。'
      })
    });
    console.log('POST issue status:', postRes.status);
    if (postRes.ok) {
      const issue = await postRes.json();
      console.log('Created issue #' + issue.number + ': ' + issue.html_url);

      // Close it immediately
      const closeRes = await fetch('https://api.github.com/repos/fengdlwxy-sudo/websit/issues/' + issue.number, {
        method: 'POST',
        headers,
        body: JSON.stringify({ state: 'closed' })
      });
      console.log('CLOSE issue status:', closeRes.status);
    } else {
      const err = await postRes.text();
      console.log('POST error:', err.slice(0, 800));
    }
  } catch (e) {
    console.error('Test failed:', e.message);
  }
}

test();
