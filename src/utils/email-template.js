function buildEmailTemplate ({title = "System Error", content, redirectLink}) {
    return `
  <body style="margin:0; padding:0; background:#f2f2f2f2;">
    <center>
    <div style="width:100%; max-width:600px; background:#ffffff; padding:30px 20px; text-align:left; font-family: 'Arial', sans-serif;">
      <a href="http://vamvamlogistics.com">
        <img src="https://ultimateholdingsinc.com/wp-content/uploads/2023/09/logo_vam_vam_Plan-de-travail-1-1-1024x1024.png" 
        width="100"  style="display:block; margin-bottom:30px;text-align: center;">
      </a>
      <h1 style="font-size:18px; line-height:24px; font-weight:bold; color:#666666;">
       ${title}
      </h1>
      <hr style="color:#666666;">
      <p style="font-size:16px; line-height:24px; color:#666666; margin-bottom:30px;">
		  ${content}
      </p>
      <p style="font-size:16px; line-height:24px; color:#666666; margin-bottom:30px;">
		  <a href="${redirectLink ? redirectLink : ''}">${redirectLink ? 'Dashboard Login' : ''}</a>
      </p>
      <hr style="border:none; height:1px; color:#dddddd; background:#dddddd; width:100%; margin-bottom:20px;">
      <p style="font-size:12px; line-height:18px; color:#999999; margin-bottom:10px;">
        <a href="http://vamvamlogistics.com"
           style="font-size:12px; line-height:18px; color:#666666; font-weight:bold;"> vamvamlogistics.com</a>
           +237 683 411 151 |  Email: contact@vamvamlogistics.com <br>
      </p>
    </div>
    </center>  
  </body>
</html>
    `
}
module.exports = buildEmailTemplate;