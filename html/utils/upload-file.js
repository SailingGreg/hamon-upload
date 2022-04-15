export default function uploadFile(file, endpoint, silent = false, password = '') {
  if (!file || !endpoint) {
    window.alert('File upload failed')
    return new Promise.resolve(false)
  }
  var blob = new Blob([file]);
  var formData = new FormData();
  formData.append('configFile', blob, file?.name);
  formData.append('configFilePassword', password);

  return fetch(endpoint, {
    body: formData,
    method: "post",
  })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        window.alert(data.error)
        return false
      }
      if (data.msg && !silent) {
        window.alert(data.msg)
        return false
      }
      return true
    });
}