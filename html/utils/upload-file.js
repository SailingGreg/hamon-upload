export default function uploadFile(file, endpoint, silent = false) {
  if (!file || !endpoint) {
    window.alert('File upload failed')
    return
  }
  var blob = new Blob([file]);
  var formData = new FormData();
  formData.append('configFile', blob, file?.name);

  fetch(endpoint, {
    body: formData,
    method: "post",
  })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        window.alert(data.error)
        return
      }
      if (data.msg && !silent) {
        window.alert(data.msg)
      }
    });
}