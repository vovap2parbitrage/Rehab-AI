<#macro content>
  <#if ((client.clientId)!"") == "rehab-ai-web" && (client.baseUrl)?has_content>
    <#assign returnPage = (pageId == "register")?then("register", "login")>
    <div class="${properties.kcLoginMainFooterBand!}">
      <a href="${client.baseUrl?remove_ending("/")}/${returnPage}?error=access_denied">
        ${kcSanitize(msg("backToApplication"))?no_esc}
      </a>
    </div>
  </#if>
</#macro>
